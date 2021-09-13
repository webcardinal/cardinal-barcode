import {Component, Prop, State, Element, Method, h} from '@stencil/core';
import {BindModel, CustomTheme, TableOfContentProperty} from '@cardinal/internals';
import audio from './audio';

const INTERVAL_ZXING_LOADED = 300;
const INTERVAL_BETWEEN_SCANS = 2000;
const DELAY_AFTER_RESULT = 500;
const DELAY_FOR_CUSTOM_DRAWING = 500;
const STATUS = {
    IN_PROGRESS: "Camera detection in progress...",
    DONE: "Scan done.",
    NO_DETECTION: "No camera detected."
}

@Component({
    tag: 'psk-barcode-scanner',
    shadow: true
})
export class PskBarcodeScanner {

    @BindModel() modelHandler;

    @CustomTheme()

    @Element() host: HTMLElement;

    @TableOfContentProperty({
        description: `The data-model that will be updated with the retrieved data from the scanner.`,
        isMandatory: true,
        propertyType: `string`
    })
    @Prop() data: any;

    @TableOfContentProperty({
        description: `A title that will be used for the current component instance.`,
        isMandatory: false,
        propertyType: `string`
    })
    @Prop() title: string = '';

    @TableOfContentProperty({
        description: `Decides if the square canvas should be rendered on the screen.`,
        isMandatory: false,
        propertyType: `boolean`
    })
    @Prop() hideDrawing: false;

    @State() ZXing = null;
    @State() activeDeviceId: string | null = null;
    @State() status = STATUS.IN_PROGRESS;
    @State() isCameraAvailable = false;

    private codeReader = null;
    private overlay = null;
    private devices = [];
    private isScanDone = false;
    private isComponentDisconnected = false;
    private slotChildren: HTMLCollection;

    constructor() {
        window.addEventListener('resize', _ => {
            this.cleanupOverlays();
            this.drawOverlays();
        });
    }

    private async drawOverlays() {
        if (!this.host || !this.host.shadowRoot) {
            return;
        }

        if (this.hideDrawing) {
            return;
        }

        const { shadowRoot } = this.host;

        const videoElement = shadowRoot.querySelector('#video');
        const scannerContainer = shadowRoot.querySelector('#scanner-container');
        const { VideoOverlay } = await import('./overlays');
        this.overlay = new VideoOverlay(scannerContainer, videoElement);
        const success = this.overlay.createOverlaysCanvases('lensCanvas', 'overlayCanvas');
        if (success) {
            this.overlay.drawLensCanvas();
        }
    }

    private showSlotItems(timeout = 0) {
        setTimeout(() => {
            for (let i = 0; i < this.slotChildren.length; i++) {
                this.slotChildren[i].removeAttribute('hidden');
            }
        }, timeout)
    }

    private hideSlotItems() {
        for (let i = 0; i < this.slotChildren.length; i++) {
            this.slotChildren[i].setAttribute('hidden', '');
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

        if (!this.isScanDone) {
            this.cleanupOverlays();
            this.drawOverlays();

            this.codeReader.reset();
            this.codeReader.decodeFromConstraints(constraints, videoElement, (result, err) => {
                if (result && !this.isScanDone) {
                    console.log('result', result);

                    if (this.modelHandler) {
                        audio.play();
                        if (this.overlay) {
                            this.overlay.drawOverlay(result.resultPoints);
                        }
                        this.modelHandler.updateModel('data', result.text);
                        this.isScanDone = true;
                        this.status = STATUS.DONE;

                        setTimeout(_ => {
                            this.codeReader.reset();
                            if (this.overlay) {
                                this.overlay.removeOverlays();
                            }
                            this.hideSlotItems();
                        }, DELAY_AFTER_RESULT);
                    }
                }
                if (err && !(err instanceof this.ZXing.NotFoundException)) {
                    this.hideSlotItems();
                    console.error(err);
                }
            });
            this.showSlotItems(DELAY_FOR_CUSTOM_DRAWING);
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
        this.isScanDone = false;
    }

    async componentWillLoad() {
        let tick = () => {
            if (window['ZXing'] && !this.ZXing && !this.codeReader) {
                this.ZXing = window['ZXing'];
                this.codeReader = new this.ZXing.BrowserMultiFormatReader(null, INTERVAL_BETWEEN_SCANS);
            } else {
                setTimeout(tick, INTERVAL_ZXING_LOADED);
            }
        };

        this.slotChildren = this.host.children;
        this.hideSlotItems();

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

            if (this.devices.length > 0) {
                this.isCameraAvailable = true;
            } else {
                this.status = STATUS.NO_DETECTION;
            }
        }
    }

    async componentDidRender() {
        if (this.isCameraAvailable && !this.isComponentDisconnected) {
            this.startScanning(this.activeDeviceId);
        }
    }

    async connectedCallback() {
        this.isComponentDisconnected = false;
    }

    async disconnectedCallback() {
        this.isComponentDisconnected = true;

        if (this.codeReader) {
            this.codeReader.reset();
        }
    }

    render() {
        const style = {
            barcodeWrapper: {
                display: 'grid', gridTemplateRows: '1fr',
                width: '100%', height: '100%'
            },
            videoWrapper: {
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
                fontSize: '15px'
            },
            statusDiv: {
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
                top: "50%",
                color: '#FFFFFF',
                background: 'transparent',
                borderRadius: '2px',
                border: '2px solid rgba(255, 255, 255, 0.75)',
                fontSize: '15px',
                padding: '0.3em 0.6em'
            }
        }

        const zxingPath = "webcardinal/extended/cardinal-barcode/libs/zxing.js";

        return [
            <script async src={zxingPath}/>,
            <div title={this.title} part="base" style={style.barcodeWrapper}>
                <div id="scanner-container" part="container" style={style.videoWrapper}>
                    <input type="file" accept="video/*" capture="camera" style={style.input}/>
                    <video id="video" part="video" muted autoplay playsinline={true} style={style.video}/>
                    {
                        this.isScanDone ? <div style={style.statusDiv}>
                            <div class="spinner-border text-light" role="status">
                                <span class="sr-only">Loading... </span>
                            </div>
                        </div> : null
                    }
                    {
                        this.hideDrawing ? null : (
                            <button onClick={_ => this.switchCamera()}
                                    part="button" style={style.button}>Change camera</button>
                        )
                    }
                </div>
            </div>,
            <slot/>
        ];
    }
}
