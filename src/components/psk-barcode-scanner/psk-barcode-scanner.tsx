import { Build, Component, Prop, State, Element, Method, h } from "@stencil/core";
import type { HTMLStencilElement } from "@stencil/core/internal";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BindModel } from "@cardinal/internals";

import audio from "./audio";
import {
    captureFrame,
    computeElementScalingAccordingToScreen,
    createElement,
    getStream,
    isElementVisibleInViewport,
    snapFrame,
    style,
} from "./psk-barcode-scanner.utils";
import type { PskBarcodeVideoElements } from "./psk-barcode-scanner.utils";

const INTERVAL_BETWEEN_SCANS = 1000;
const INTERVAL_BETWEEN_INVERTED_SCANS = 1000;

enum STATUS {
    INIT = "Initializing component...",
    LOAD_CAMERAS = "Detecting your cameras...",
    IN_PROGRESS = "Detection in progress...",
    DONE = "Scan done.",
    NO_DETECTION = "No camera detected.",
    ACCESS_DENIED = "Access denied",
    CHANGE_CAMERA = "Change camera",
}

const templates = {
    init: createElement("div", {
        style: style.button,
        text: "Booting camera...",
    }),
    active: createElement("button", {
        style: style.button,
        text: "Change camera",
    }),
    done: createElement("div", { style: style.button, text: "Scan complete!" }),
    error: createElement("div", {
        style: style.button,
        text: "No camera device found!",
    }),
    feedback: createElement("div", {
        style: style.button,
        text: "Checking permissions...",
    }),
    access_denied: createElement("div", {
        style: style.button,
        text: "Access denied...",
    }),
};
templates.active.setAttribute("change-camera", "");

const lastDimensions = {
    width: NaN,
    height: NaN,
};

@Component({
    tag: "psk-barcode-scanner",
    shadow: true,
})
export class PskBarcodeScanner {
    @BindModel() modelHandler;

    @Element() host: HTMLStencilElement;

    /**
     * The model-handler scope that will be updated with the retrieved data from the scanner.
     */
    @Prop() data: string;

    /**
     * Decides if a screenshot is made after scanning.
     */
    @Prop() snapVideo = false;

    /**
     * Decides if internal status of component is logged.
     */
    @Prop() noLogs = false;

    /**
     * If <code>true</code>, setFrames can be used and custom frames will be scanned.
     */
    @Prop({ reflect: true }) useFrames = false;

    @State() status: STATUS = STATUS.INIT;

    private activeDeviceId: string | undefined;

    private devices = [];
    private scanners = {
        default: {
            reader: undefined as BrowserMultiFormatReader,
            controls: undefined as any,
        },
        invertedSymbols: {
            reader: undefined as BrowserMultiFormatReader,
            controls: undefined as any,
        },
    };
    private overlay;

    private useFramesContext = {
        canvas: undefined as HTMLCanvasElement,
        context: undefined as CanvasRenderingContext2D,
        stream: undefined as MediaStream,
    };

    constructor() {
        window.addEventListener("resize", () => {
            window.requestAnimationFrame(async () => {
                this.cleanupOverlays();
                await this.drawOverlays();
            });
        });
    }

    // Pre-rendering...

    private createCustomizedElement = (name) => {
        if (this.host.querySelector(`[slot=${name}]`)) {
            return createElement("slot", { name });
        }
        templates[name].part = name;
        return templates[name];
    };

    private createCanvasElement = (id: string) => {
        const scannerContainer = this.host.shadowRoot.querySelector("#container") as HTMLElement;

        if (!lastDimensions.width) {
            lastDimensions.width = scannerContainer.offsetWidth;
            lastDimensions.height = scannerContainer.offsetHeight;
        }

        return createElement("canvas", {
            id,
            width: scannerContainer.offsetWidth || lastDimensions.width,
            height: scannerContainer.offsetHeight || lastDimensions.height,
            style: { position: "absolute", width: "100%", top: 0, left: 0 },
        }) as HTMLCanvasElement;
    };

    private attachOnClickForChangeCamera = () => {
        const toggle = this.host.shadowRoot.querySelector("[change-camera]") as HTMLButtonElement;
        if (toggle) {
            toggle.onclick = async () => await this.switchCamera();
        }
    };

    private renderContent = () => {
        if (Build.isDev || !this.noLogs) {
            console.log("[psk-barcode-scanner] Status:", this.status);
        }

        let element;
        switch (this.status) {
            case STATUS.INIT:
                element = this.createCustomizedElement("init");
                break;
            case STATUS.NO_DETECTION:
                element = this.createCustomizedElement("error");
                break;
            case STATUS.DONE:
                element = this.createCustomizedElement("done");
                break;
            case STATUS.LOAD_CAMERAS:
                if (this.host.hasAttribute('disable-some-slots')) {
                    element = '';
                    return ;
                }

                element = this.createCustomizedElement("feedback");
                break;
            case STATUS.ACCESS_DENIED:
                element = this.createCustomizedElement("access_denied");
                break;
            default: {
                if (this.host.hasAttribute('disable-some-slots')) {
                    element = '';
                    return ;
                }

                element = this.createCustomizedElement("active");
            }
        }

        const t = createElement("div");
        t.append(element);
        return t.innerHTML;
    };

    // Overlays

    private drawOverlays = async () => {
        if (!this.host || !this.host.shadowRoot || this.host.querySelector("[slot=active]")) {
            return;
        }

        const { shadowRoot } = this.host;
        const videoElement = shadowRoot.querySelector("#video");
        const scannerContainer = shadowRoot.querySelector("#container");
        const { VideoOverlay } = await import("./overlays");
        this.overlay = new VideoOverlay(scannerContainer, videoElement);
        const success = this.overlay.createOverlaysCanvases("lensCanvas", "overlayCanvas");
        if (success) {
            this.overlay.drawLensCanvas();
        }
    };

    private cleanupOverlays = () => {
        if (this.overlay) {
            this.overlay.removeOverlays();
        }
    };

    // Inverted Symbols

    private drawInvertedSymbolsFrame = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
        // for infinite loops of the recursion
        if (this.status === STATUS.DONE) {
            return;
        }

        const canvasContext = canvas.getContext("2d");

        // scale video according to screen dimensions
        const [x, y, w, h] = computeElementScalingAccordingToScreen(
            {
                width: video.videoWidth,
                height: video.videoHeight,
            },
            canvas
        );
        canvasContext.drawImage(video, x, y, w, h);

        // invert colors of the current frame
        const image = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = image.data[i] ^ 255;
            image.data[i + 1] = image.data[i + 1] ^ 255;
            image.data[i + 2] = image.data[i + 2] ^ 255;
        }
        canvasContext.putImageData(image, 0, 0);

        setTimeout(() => {
            this.drawInvertedSymbolsFrame(video, canvas);
        }, INTERVAL_BETWEEN_INVERTED_SCANS);
    };

    private getInvertedSymbolsStream = async (video: HTMLVideoElement, frameRate: number): Promise<MediaStream> => {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (isElementVisibleInViewport(video)) {
                    const invertedSymbolsCanvas = this.createCanvasElement("invertedCanvas");
                    const invertedStream = getStream(invertedSymbolsCanvas, frameRate);
                    this.drawInvertedSymbolsFrame(video, invertedSymbolsCanvas);
                    resolve(invertedStream);
                    clearInterval(interval);
                }
            }, 300);
        });
    };

    // Scanning...

    private scanUsingFrames = (videoElements: PskBarcodeVideoElements, decodeCallback) => {
        window.requestAnimationFrame(async () => {
            const { video, invertedSymbolsVideo } = videoElements;

            const defaultStream = getStream(video, INTERVAL_BETWEEN_SCANS);
            this.scanners.default.controls = await this.scanners.default.reader.decodeFromStream(
                defaultStream,
                video,
                decodeCallback
            );

            const invertedStream = await this.getInvertedSymbolsStream(video, INTERVAL_BETWEEN_INVERTED_SCANS);
            this.scanners.invertedSymbols.controls = await this.scanners.default.reader.decodeFromStream(
                invertedStream,
                invertedSymbolsVideo,
                decodeCallback
            );
        });
    };

    private scanUsingNavigator = (videoElements: PskBarcodeVideoElements, deviceId: string, decodeCallback) => {
        const { video, invertedSymbolsVideo } = videoElements;

        const constraints = {
            video: {
                facingMode: "environment",
            },
        };

        if (deviceId && deviceId !== "no-camera") {
            delete constraints.video.facingMode;
            constraints.video["deviceId"] = {
                exact: deviceId,
            };
        }

        video.onplay = async () => {
            this.status = STATUS.IN_PROGRESS;
            this.cleanupOverlays();
            await this.drawOverlays();
            video.removeAttribute("hidden");
        };

        // Since ZXing's "decodeFromConstraints" throws a DOM error
        // the following call is made only for the error case
        // in order to update the current status of the component
        navigator.mediaDevices
            .getUserMedia(constraints)
            .then(async (stream) => {
                // If there is no error, camera access is guaranteed
                // but the same stream will be again requested by ZXing in "decodeFromConstraints"
                // in some browsers (e.g. Chrome) same instance will be returned each time,
                // but in other browsers (e.g. Safari) a new MediaStream instance will be created,
                // if all the tracks from the previous stream aren't stopped the "camera" will be locked in record state
                stream.getTracks().forEach((track) => track.stop());
                this.scanners.default.controls = await this.scanners.default.reader.decodeFromConstraints(
                    constraints,
                    video,
                    decodeCallback
                );

                const invertedSymbolsStream = await this.getInvertedSymbolsStream(
                    video,
                    INTERVAL_BETWEEN_INVERTED_SCANS
                );
                this.scanners.invertedSymbols.controls = await this.scanners.invertedSymbols.reader.decodeFromStream(
                    invertedSymbolsStream,
                    invertedSymbolsVideo,
                    decodeCallback
                );
            })
            .catch((error) => {
                this.status = STATUS.ACCESS_DENIED;
                console.error("[psk-barcode-scanner] Error while getting userMedia", error);
            });
    };

    private startScanning = (deviceId: string) => {
        switch (this.status) {
            case STATUS.LOAD_CAMERAS:
            case STATUS.CHANGE_CAMERA: {
                const videoElements: PskBarcodeVideoElements = {
                    video: this.host.shadowRoot.querySelector("#video") as HTMLVideoElement,
                    invertedSymbolsVideo: this.host.shadowRoot.querySelector("#invertedSymbolsVideo") as HTMLVideoElement,
                };

                if (this.status === STATUS.CHANGE_CAMERA) {
                    this.stopScanning();
                }

                const decodeCallback = (result, err) => {
                    if (result && this.status === STATUS.IN_PROGRESS) {
                        if (!this.noLogs) {
                            console.log("[psk-barcode-scanner] Scanned data:", result);
                        }

                        if (this.modelHandler) {
                            this.status = STATUS.DONE;

                            audio.play();

                            if (this.overlay) {
                                this.overlay.drawOverlay(result.resultPoints);
                            }

                            if (this.snapVideo) {
                                snapFrame(videoElements.video);
                            }

                            if (this.host.hasAttribute("results")) {
                                result.frame = captureFrame(videoElements.video);
                                this.modelHandler.updateModel("results", result);
                            }

                            this.modelHandler.updateModel("data", result.text);

                            this.stopScanning();

                            if (!this.snapVideo) {
                                this.cleanupOverlays();
                            }
                        }
                    }
                    if (err && err.message !== "No MultiFormat Readers were able to detect the code.") {
                        console.error("[psk-barcode-scanner] Error while decoding", err);
                    }
                };

                if (this.useFrames) {
                    this.scanUsingFrames(videoElements, decodeCallback);
                } else {
                    this.scanUsingNavigator(videoElements, deviceId, decodeCallback);
                }

                break;
            }
        }
    };

    private stopScanning = () => {
        for (const key of Object.keys(this.scanners)) {
            if (this.scanners[key].controls) {
                this.scanners[key].controls.stop();
            }
        }
    };

    // Public Methods

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
        if (!this.useFrames) {
            return;
        }

        if (!this.host || !this.host.shadowRoot) {
            await this.host.componentOnReady();
        }


        if (!this.useFramesContext.canvas || !this.useFramesContext.stream) {
            const { shadowRoot } = this.host;
            const scannerContainer = shadowRoot.querySelector("#container") as HTMLElement;
            const canvas = createElement("canvas", {
                id: "frameCanvas",
                width: scannerContainer.offsetWidth || lastDimensions.width,
                height: scannerContainer.offsetHeight || lastDimensions.height,
                style: { position: "absolute", width: "100%", top: 0, left: 0 },
            }) as any;
            const stream = canvas.captureStream(30);
            this.useFramesContext.canvas = canvas;
            this.useFramesContext.context = canvas.getContext("2d");
            this.useFramesContext.stream = stream;

            const videoElement = this.host.shadowRoot.querySelector("#video") as HTMLVideoElement;
            videoElement.onplay = async () => {
                this.status = STATUS.IN_PROGRESS;
                this.cleanupOverlays();
                await this.drawOverlays();
                videoElement.removeAttribute("hidden");
            };
            videoElement.srcObject = this.useFramesContext.stream;
        }

        const imageElement = new Image();
        imageElement.addEventListener("load", () => {
            // scale image that will be played as stream according to screen dimensions
            const [x, y, w, h] = computeElementScalingAccordingToScreen(imageElement, this.useFramesContext.canvas);
            this.useFramesContext.context.drawImage(imageElement, x, y, w, h);
        });
        imageElement.src = src;
    }

    // Lifecycle

    async componentWillLoad() {
        if (!this.host.isConnected) {
            return;
        }

        const hints = new Map();
        hints.set(3, true); // TRY_HARDER

        this.scanners.default.reader = new BrowserMultiFormatReader(hints);
        this.scanners.invertedSymbols.reader = new BrowserMultiFormatReader(hints);

        this.status = STATUS.LOAD_CAMERAS;
    }

    async componentWillRender() {
        if (this.useFrames) {
            return;
        }

        if (this.devices.length === 0 || !this.activeDeviceId) {
            try {
                this.devices = await BrowserMultiFormatReader.listVideoInputDevices();
            } catch (error) {
                console.error("[psk-barcode-scanner] Error while getting video devices", error);
            }

            if (this.devices.length === 0) {
                this.status = STATUS.NO_DETECTION;
            }
        }
    }

    async componentDidRender() {
        this.startScanning(this.activeDeviceId);
        this.attachOnClickForChangeCamera();
    }

    async disconnectedCallback() {
        this.stopScanning();
    }

    render() {
        return (
            <div part="base" style={style.base}>
                <div id="container" part="container" style={style.container}>
                    <input type="file" accept="video/*" capture="environment" style={style.input} />
                    <video id="video" part="video" muted autoplay playsinline hidden style={style.video} />
                    <video
                        id="invertedSymbolsVideo"
                        muted
                        autoplay
                        playsinline
                        hidden
                        style={style.invertedSymbolsVideo}
                    />
                    <div id="content" part="content" innerHTML={this.renderContent()} />
                </div>
            </div>
        );
    }
}
