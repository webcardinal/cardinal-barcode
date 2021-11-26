import { Build, Component, Prop, State, Element, Method, h } from '@stencil/core';
import { BindModel, TableOfContentProperty } from '@cardinal/internals';

import audio from './audio';
import {
    computeElementScalingAccordingToScreen,
    createElement,
    style
} from './psk-barcode-scanner.utils';

const INTERVAL_ZXING_LOADED = 300;
const INTERVAL_BETWEEN_SCANS = 2000;
const INTERVAL_BETWEEN_INVERTED_SCANS = 50;
const DELAY_AFTER_RESULT = 500;

enum STATUS {
    INIT = "Initializing component...",
    LOAD_CAMERAS = "Detecting your cameras...",
    IN_PROGRESS = "Camera detection in progress...",
    DONE = "Scan done.",
    NO_DETECTION = "No camera detected.",
    ACCESS_DENIED = "Access denied",
    CHANGE_CAMERA = "Change camera"
}

const src = "webcardinal/extended/cardinal-barcode/libs/zxing.min.js";

const templates = {
    init: createElement('div', { style: style.button, text: 'Booting camera...' }),
    active: createElement('button', { style: style.button, text: 'Change camera' }),
    done: createElement('div', { style: style.button, text: 'Scan complete!' }),
    error: createElement('div', { style: style.button, text: 'No camera device found!' }),
    feedback: createElement('div', { style: style.button, text: 'Checking permissions...' }),
    access_denied: createElement('div', { style: style.button, text: 'Access denied...' })
}
templates.active.setAttribute('change-camera', '');

const lastDimensions = {
    width: NaN,
    height: NaN
}

@Component({
    tag: 'psk-barcode-scanner',
    shadow: true
})
export class PskBarcodeScanner {

    @BindModel() modelHandler;

    @Element() host: HTMLElement;

    @TableOfContentProperty({
        description: `The data-model that will be updated with the retrieved data from the scanner.`,
        isMandatory: true,
        propertyType: `string`
    })
    @Prop() data: any;

    @TableOfContentProperty({
        description: `Decides if a screenshot is made after scanning.`,
        isMandatory: false,
        propertyType: `boolean`
    })
    @Prop() snapVideo: false;

    @TableOfContentProperty({
        description: `Decides if internal status of component is logged.`,
        isMandatory: false,
        propertyType: `boolean`
    })
    @Prop() noLogs = false;

    @Prop({ reflect: true }) useFrames = false;

    @State() status: STATUS = STATUS.INIT;
    @State() ZXing;
    @State() activeDeviceId: string | undefined;

    private codeReader;
    private invertedCodeReader;
    private overlay;
    private devices = [];

    private useFramesContext = {
        canvas: undefined as HTMLCanvasElement,
        context: undefined as CanvasRenderingContext2D,
        stream: undefined as MediaStream
    };

    constructor() {
        window.addEventListener('resize', _ => {
            window.requestAnimationFrame(async () => {
                this.cleanupOverlays();
                await this.drawOverlays();
            });
        });
    }

    private createCustomizedElement = (name) => {
        if (this.host.querySelector(`[slot=${name}]`)) {
            return createElement('slot', { name });
        }
        templates[name].part = name;
        return templates[name];
    }

    private renderContent = () => {
        if (Build.isDev || !this.noLogs) {
            console.log('Status:', this.status);
        }

        let element;
        switch (this.status) {
            case STATUS.INIT:
                element = this.createCustomizedElement('init');
                break;
            case STATUS.NO_DETECTION:
                element = this.createCustomizedElement('error');
                break;
            case STATUS.DONE:
                element = this.createCustomizedElement('done');
                break;
            case STATUS.LOAD_CAMERAS:
                element = this.createCustomizedElement('feedback');
                break;
            case STATUS.ACCESS_DENIED:
                element = this.createCustomizedElement('access_denied');
                break;
            default:
                element = this.createCustomizedElement('active');
        }

        const t = createElement('div');
        t.append(element);
        return t.innerHTML;
    }

    private drawOverlays = async () => {
        if (!this.host || !this.host.shadowRoot || this.host.querySelector('[slot=active]')) {
            return;
        }

        const { shadowRoot } = this.host;
        const videoElement = shadowRoot.querySelector('#video');
        const scannerContainer = shadowRoot.querySelector('#container');
        const { VideoOverlay } = await import('./overlays');
        this.overlay = new VideoOverlay(scannerContainer, videoElement);
        const success = this.overlay.createOverlaysCanvases('lensCanvas', 'overlayCanvas');
        if (success) {
            this.overlay.drawLensCanvas();
        }
    }

    private cleanupOverlays = () => {
        if (this.overlay) {
            this.overlay.removeOverlays();
        }
    }

    private getInvertedCanvas = () => {
        if (!this.host || !this.host.shadowRoot) {
            return;
        }

        const scannerContainer = this.host.shadowRoot.querySelector('#container') as HTMLElement;

        if (!lastDimensions.width) {
            lastDimensions.width = scannerContainer.offsetWidth;
            lastDimensions.height = scannerContainer.offsetHeight;
        }

        const invertedCanvasElement = createElement('canvas', {
            id: "invertedCanvas",
            width: scannerContainer.offsetWidth || lastDimensions.width,
            height: scannerContainer.offsetHeight || lastDimensions.height,
            style: { position: 'absolute', width: '100%', top: 0, left: 0 }
        }) as any;
        const invertedStream = invertedCanvasElement.captureStream(INTERVAL_BETWEEN_INVERTED_SCANS);

        return [invertedCanvasElement, invertedStream];
    }

    private drawInvertedFrame = (videoElement, canvasElement) => {
        // for infinite loops of the recursion
        if (this.status === STATUS.DONE) {
            return;
        }

        const canvasContext = canvasElement.getContext('2d');

        // scale video according to screen dimensions
        const [x, y, w, h] = computeElementScalingAccordingToScreen({
            width: videoElement.videoWidth,
            height: videoElement.videoHeight
        }, canvasElement);
        canvasContext.drawImage(videoElement, x, y, w, h);

        // invert colors of the current frame
        const image = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = image.data[i] ^ 255;
            image.data[i + 1] = image.data[i + 1] ^ 255;
            image.data[i + 2] = image.data[i + 2] ^ 255;
        }
        canvasContext.putImageData(image, 0, 0);

        setTimeout(() => {
            this.drawInvertedFrame(videoElement, canvasElement);
        }, INTERVAL_BETWEEN_INVERTED_SCANS);
    }

    private scanUsingFrames = (videoElement, invertedVideoElement, decodeCallback) => {
        window.requestAnimationFrame(() => {
            const [invertedCanvasElement, invertedStream] = this.getInvertedCanvas();
            this.drawInvertedFrame(videoElement, invertedCanvasElement);

            // @ts-ignore
            this.codeReader.decodeFromStream(videoElement.captureStream(30), videoElement, decodeCallback);
            this.invertedCodeReader.decodeFromStream(invertedStream, invertedVideoElement, decodeCallback);
        });
    }

    private scanUsingNavigator = (deviceId, videoElement, invertedVideoElement, decodeCallback) => {
        const constraints = {
            video: {
                facingMode: 'environment'
            }
        };

        if (deviceId && deviceId !== 'no-camera') {
            delete constraints.video.facingMode;
            constraints.video['deviceId'] = {
                exact: deviceId
            };
        }

        videoElement.onplay = async () => {
            this.status = STATUS.IN_PROGRESS;
            this.cleanupOverlays();
            await this.drawOverlays();
            videoElement.removeAttribute('hidden');
        }

        // Since ZXing's "decodeFromConstraints" throws a DOM error
        // the following call is made only for the error case
        // in order to update the current status of the component
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                // If there is no error, camera access is guaranteed
                // but the same stream will be again requested by ZXing in "decodeFromConstraints"
                // in some browsers (e.g. Chrome) same instance will be returned each time,
                // but in other browsers (e.g. Safari) a new MediaStream instance will be created,
                // if all the tracks from the previous stream aren't stopped the "camera" will be locked in record state
                stream.getTracks().forEach((track) => track.stop());

                const [invertedCanvasElement, invertedStream] = this.getInvertedCanvas();
                this.drawInvertedFrame(videoElement, invertedCanvasElement);

                this.codeReader.decodeFromConstraints(constraints, videoElement, decodeCallback);
                this.invertedCodeReader.decodeFromStream(invertedStream, invertedVideoElement, decodeCallback);
            })
            .catch(err => {
                this.status = STATUS.ACCESS_DENIED;
                console.log('getUserMedia', err);
            });
    }

    private scan = (deviceId: string | undefined) => {
        const videoElement = this.host.shadowRoot.querySelector('#video') as HTMLVideoElement;
        const invertedVideoElement = this.host.shadowRoot.querySelector('#invertedVideo') as HTMLVideoElement;

        if (this.status === STATUS.CHANGE_CAMERA) {
            this.codeReader.reset();
            this.invertedCodeReader.reset();
        }

        const decodeCallback = (result, err) => {
            if (result && this.status === STATUS.IN_PROGRESS) {
                if (!this.noLogs) {
                    console.log('Scanned data:', result);
                }

                if (this.modelHandler) {
                    this.modelHandler.updateModel('data', result.text);
                    this.status = STATUS.DONE;
                    audio.play();

                    if (this.overlay) {
                        this.overlay.drawOverlay(result.resultPoints);
                    }

                    setTimeout(() => {
                        if (this.snapVideo) {
                            const video = this.host.shadowRoot.querySelector('video')
                            const h = video.videoHeight;
                            const w = video.videoWidth;

                            const canvas = document.createElement("canvas");
                            canvas.width = w;
                            canvas.height = h;

                            const context = canvas.getContext("2d");
                            canvas.style.width = '100%';
                            canvas.style.height = '100%';
                            canvas.style.objectFit = 'cover';

                            context.drawImage(video, 0, 0, w, h);
                            video.parentElement.insertBefore(canvas, video);
                        }

                        this.codeReader.reset();
                        this.invertedCodeReader.reset();

                        if (this.overlay) {
                            this.overlay.removeOverlays();
                        }
                    }, DELAY_AFTER_RESULT);
                }
            }
            if (err && !(err instanceof this.ZXing.NotFoundException)) {
                console.error(err);
            }
        }

        if (this.useFrames) {
            this.scanUsingFrames(videoElement, invertedVideoElement, decodeCallback);
        } else {
            this.scanUsingNavigator(deviceId, videoElement, invertedVideoElement, decodeCallback);
        }
    }

    private tryScanning = (deviceId) => {
        switch (this.status) {
            case STATUS.LOAD_CAMERAS:
            case STATUS.CHANGE_CAMERA: {
                this.scan(deviceId);
                break;
            }
        }
    }

    @Method()
    async switchCamera() {
        let devices = [undefined];

        for (const device of this.devices) {
            devices.push(device.deviceId);
        }

        let currentIndex = devices.indexOf(this.activeDeviceId);
        if (currentIndex === devices.length - 1) {
            currentIndex = -1;
        }
        currentIndex++;

        this.activeDeviceId = devices[currentIndex];
        this.status = STATUS.CHANGE_CAMERA;
    }

    @Method()
    async setFrame(src) {
        if (!this.host || !this.host.shadowRoot || !this.useFrames) {
            return;
        }

        if (!this.useFramesContext.canvas || !this.useFramesContext.stream) {
            const { shadowRoot } = this.host;
            const scannerContainer = shadowRoot.querySelector('#container') as HTMLElement;
            const canvas = createElement('canvas', {
                id: "frameCanvas",
                width: scannerContainer.offsetWidth || lastDimensions.width,
                height: scannerContainer.offsetHeight || lastDimensions.height,
                style: { position: 'absolute', width: '100%', top: 0, left: 0 }
            }) as any;
            const stream = canvas.captureStream(30);
            this.useFramesContext.canvas = canvas;
            this.useFramesContext.context = canvas.getContext('2d');
            this.useFramesContext.stream = stream;

            const videoElement = this.host.shadowRoot.querySelector('#video') as HTMLVideoElement;
            videoElement.onplay = async () => {
                this.status = STATUS.IN_PROGRESS;
                this.cleanupOverlays();
                await this.drawOverlays();
                videoElement.removeAttribute('hidden');
            }
            videoElement.srcObject = this.useFramesContext.stream;
        }

        const imageElement = new Image();
        imageElement.addEventListener('load', () => {
            // scale image that will be played as stream according to screen dimensions
            const [x, y, w, h] = computeElementScalingAccordingToScreen(imageElement, this.useFramesContext.canvas);
            this.useFramesContext.context.drawImage(imageElement, x, y, w, h);
        });
        imageElement.src = src;
    }

    async componentWillLoad() {
        const tick = () => {
            if (window['ZXing'] && !this.ZXing && !this.codeReader) {
                this.ZXing = window['ZXing'];
                this.codeReader = new this.ZXing.BrowserMultiFormatReader(null, INTERVAL_BETWEEN_SCANS);
                this.invertedCodeReader = new this.ZXing.BrowserMultiFormatReader(null, INTERVAL_BETWEEN_INVERTED_SCANS);
                this.status = STATUS.LOAD_CAMERAS;
                if ((!this.host || !this.host.isConnected) && this.codeReader && this.invertedCodeReader) {
                    this.status = STATUS.INIT;
                    this.codeReader.reset();
                    this.invertedCodeReader.reset();
                }
            } else {
                setTimeout(tick, INTERVAL_ZXING_LOADED);
            }
        };

        tick();
    }

    async componentWillRender() {
        // ZXing unloaded
        if (!this.ZXing) {
            return;
        }

        // No devices yet
        if (this.devices.length === 0 || !this.activeDeviceId) {
            try {
                this.devices = await this.codeReader.listVideoInputDevices();
            } catch (error) {
                // console.error(error);
            }

            if (this.devices.length === 0) {
                this.status = STATUS.NO_DETECTION;
            }
        }
    }

    async componentDidRender() {
        if (!this.host.isConnected) {
            return;
        }

        this.tryScanning(this.activeDeviceId);

        const toggle = this.host.shadowRoot.querySelector('[change-camera]') as HTMLButtonElement;
        if (toggle) {
            toggle.onclick = async () => await this.switchCamera();
        }
    }

    async disconnectedCallback() {
        if (this.codeReader) {
            this.codeReader.reset();
        }
        if (this.invertedCodeReader) {
            this.invertedCodeReader.reset();
        }
    }

    render() {
        return [
            <script async src={src}/>,
            <div title={this.host.getAttribute('title')} part="base" style={style.base}>
                <div id="container" part="container" style={style.container}>
                    <input type="file" accept="video/*" capture="environment" style={style.input}/>
                    <video id="video" part="video" muted autoplay playsinline hidden style={style.video}/>
                    <video id="invertedVideo" muted autoplay playsinline hidden style={style.invertedVideo}/>
                    <div id="content" part="content" innerHTML={this.renderContent()}/>
                </div>
            </div>
        ];
    }
}
