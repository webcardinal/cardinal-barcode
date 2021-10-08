import { Component, Prop, State, Element, Method, h } from '@stencil/core';
import { BindModel, TableOfContentProperty } from '@cardinal/internals';
import audio from './audio';

const INTERVAL_ZXING_LOADED = 300;
const INTERVAL_BETWEEN_SCANS = 2000;
const DELAY_AFTER_RESULT = 500;

enum STATUS {
    INIT = "Initializing component...",
    LOAD_CAMERAS = "Detecting your cameras...",
    IN_PROGRESS = "Camera detection in progress...",
    DONE = "Scan done.",
    NO_DETECTION = "No camera detected.",
    ACCESS_DENIED = "Access denied"
}

const style = {
    base: {
        display: 'grid', gridTemplateRows: '1fr',
        width: '100%', height: '100%'
    },
    container: {
        position: 'relative',
        display: 'grid', gridTemplateRows: '1fr',
        overflow: 'hidden',
        minHeight: '350px',
        padding: '0', margin: '0'
    },
    video: {
        height: '100%', width: '100%',
        objectFit: 'cover'
    },
    input: {
        display: 'none'
    },
    button: {
        position: 'absolute', zIndex: '1',
        padding: '0.3em 0.6em',
        bottom: '1em', left: '50%', transform: 'translateX(-50%)',
        color: '#FFFFFF', background: 'transparent',
        borderRadius: '2px', border: '2px solid rgba(255, 255, 255, 0.75)',
        fontSize: '15px',
        textAlign: 'center',
    }
}

const src = "webcardinal/extended/cardinal-barcode/libs/zxing.js";

const templates = {
    init: createElement('div', { style: style.button, text: 'Booting camera...' }),
    active: createElement('button', { style: style.button, text: 'Change camera'}),
    done: createElement('div', { style: style.button, text: 'Scan complete!' }),
    error: createElement('div', { style: style.button, text: 'No camera device found!' }),
    feedback: createElement('div', { style: style.button, text: 'Checking permissions...' }),
    access_denied: createElement('div', { style: style.button, text: 'Access denied...' })
}

function createElement(name, props?: any) {
    if (!props) {
        props = {};
    }
    if (!props.style) {
        props.style = {};
    }
    if (!props.text) {
        props.text = '';
    }
    const { style, text } = props;
    delete props.style;
    delete props.text;
    const element = Object.assign(document.createElement(name), props);
    Object.keys(style).forEach(rule => element.style[rule] = style[rule]);
    element.innerHTML = text;
    return element;
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
    @Prop() noLogs: false;

    @State() status: STATUS = STATUS.INIT;
    @State() ZXing;
    @State() activeDeviceId: string | undefined;

    private codeReader;
    private overlay;
    private devices = [];

    constructor() {
        window.addEventListener('resize', _ => {
            this.cleanupOverlays();
            this.drawOverlays();
        });
    }

    private createCustomizedElement(name) {
        if (this.host.querySelector(`[slot=${name}]`)) {
            return createElement('slot', { name });
        }
        templates[name].part = name;
        return templates[name];
    }

    private renderContent() {
        if (!this.noLogs) {
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

    private async drawOverlays() {
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

    private cleanupOverlays() {
        if (this.overlay) {
            this.overlay.removeOverlays();
        }
    }

    private startScanning(deviceId) {
        const videoElement = this.host.shadowRoot.querySelector('#video');

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

        if (this.status === STATUS.LOAD_CAMERAS) {
            this.cleanupOverlays();
            this.drawOverlays();
            // this.status = STATUS.IN_PROGRESS;

            this.codeReader.reset();

            this.codeReader.playVideoOnLoad(videoElement, () => {
                this.status = STATUS.IN_PROGRESS;
                videoElement.removeAttribute('hidden');
            });

            navigator.mediaDevices.getUserMedia(constraints)
                .then(() => {
                    this.codeReader.decodeFromConstraints(constraints, videoElement, (result, err) => {
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

                                setTimeout(_ => {
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
                                    if (this.overlay) {
                                        this.overlay.removeOverlays();
                                    }
                                }, DELAY_AFTER_RESULT);
                            }
                        }
                        if (err && !(err instanceof this.ZXing.NotFoundException)) {
                            console.error(err);
                        }
                    });
                })
                .catch(err => {
                    this.status = STATUS.ACCESS_DENIED;
                    console.log('getUserMedia', err);
                });
        }
    }

    @Method()
    switchCamera() {
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
        this.status = STATUS.IN_PROGRESS;
    }

    async componentWillLoad() {
        const tick = () => {
            if (window['ZXing'] && !this.ZXing && !this.codeReader) {
                this.ZXing = window['ZXing'];
                this.codeReader = new this.ZXing.BrowserMultiFormatReader(null, INTERVAL_BETWEEN_SCANS);
                this.status = STATUS.LOAD_CAMERAS;
                if ((!this.host || !this.host.isConnected) && this.codeReader) {
                    this.status = STATUS.INIT;
                    this.codeReader.reset();
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
                // this.status = STATUS.IN_PROGRESS;
            } catch (error) {
                // console.error(error);
            }

            if (this.devices.length === 0) {
                this.status = STATUS.NO_DETECTION;
            }
        }
    }

    async componentDidRender() {
        if (this.host.isConnected && this.status === STATUS.LOAD_CAMERAS) {
            this.startScanning(this.activeDeviceId);

            const defaultButton = this.host.shadowRoot.querySelector('[part=active]') as HTMLButtonElement;
            if (defaultButton) {
                defaultButton.onclick = () => this.switchCamera();
            }
        }
    }

    async disconnectedCallback() {
        if (this.codeReader) {
            this.codeReader.reset();
        }
    }

    render() {
        return [
            <script async src={src}/>,
            <div title={this.host.getAttribute('title')} part="base" style={style.base}>
                <div id="container" part="container" style={style.container}>
                    <input type="file" accept="video/*" capture="environment" style={style.input}/>
                    <video id="video" part="video" muted autoplay playsinline hidden style={style.video}/>
                    <div id="content" part="content" innerHTML={this.renderContent()}/>
                </div>
            </div>
        ];
    }
}
