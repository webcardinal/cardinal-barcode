import { Build, Component, Prop, State, Element, Method, h } from "@stencil/core";
import type { HTMLStencilElement } from "@stencil/core/internal";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BindModel } from "@cardinal/internals";

import audio from "./audio";
import {
    captureFrame,
    computeElementScalingAccordingToScreen,
    createElement,
    drawFrameOnCanvas,
    snapFrame,
    style,
    waitUntilAnimationFrameIsPossible,
    waitUntilElementIsInVisibleInViewport,
} from "./psk-barcode-scanner.utils";
import filters from "./psk-barcode-scanner.filters";
import type { FilterProps } from "./psk-barcode-scanner.filters";

const INTERVAL_BETWEEN_SCANS = 1000;

enum STATUS {
    INIT = "Initializing component...",
    LOAD_CAMERAS = "Detecting your cameras...",
    IN_PROGRESS = "Detection in progress...",
    DONE = "Scan done.",
    NO_DETECTION = "No camera detected.",
    ACCESS_DENIED = "Access denied",
    CHANGE_CAMERA = "Change camera",
}

type Scanner = { reader: BrowserMultiFormatReader; controls: any };

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

    private video: HTMLVideoElement;

    private container: HTMLDivElement;

    private intervals: Set<number> = new Set<number>();

    private devices: MediaDeviceInfo[] = [];

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

    private createSlotElement = (name) => {
        if (this.host.querySelector(`[slot=${name}]`)) {
            return createElement("slot", { name });
        }
        templates[name].part = name;
        return templates[name];
    };

    private createVideoElement = () => {
        const container = this.host.shadowRoot.querySelector("#container");
        if (!container) {
            console.error("[psk-barcode-scanner] Component can not render #container");
            return;
        }

        this.container = container as HTMLDivElement;

        this.video = createElement("video", {
            id: "video",
            muted: true,
            autoplay: true,
            playsinline: true,
            hidden: true,
            style: style.video,
        }) as HTMLVideoElement;

        this.container.append(this.video);
    };

    private createCanvasElement = (id: string) => {
        const scannerContainer = this.container;

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
                element = this.createSlotElement("init");
                break;
            case STATUS.NO_DETECTION:
                element = this.createSlotElement("error");
                break;
            case STATUS.DONE:
                element = this.createSlotElement("done");
                break;
            case STATUS.LOAD_CAMERAS:
                if (this.host.hasAttribute("disable-some-slots")) {
                    element = "";
                    return;
                }

                element = this.createSlotElement("feedback");
                break;
            case STATUS.ACCESS_DENIED:
                element = this.createSlotElement("access_denied");
                break;
            default: {
                if (this.host.hasAttribute("disable-some-slots")) {
                    element = "";
                    return;
                }

                element = this.createSlotElement("active");
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

    // Decoding...

    private decodeCallback = (error, result) => {
        if (result && this.status === STATUS.IN_PROGRESS) {
            this.stopScanning();

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
                    snapFrame(this.video);
                }

                if (this.host.hasAttribute("results")) {
                    result.frame = captureFrame(this.video);
                    this.modelHandler.updateModel("results", result);
                }

                this.modelHandler.updateModel("data", result.text);

                if (!this.snapVideo) {
                    this.cleanupOverlays();
                }
            }

            this.stopVideoStream();

            return;
        }

        if (error && error.message !== "No MultiFormat Readers were able to detect the code.") {
            console.error("[psk-barcode-scanner] Error while decoding", error);
            return;
        }
    };

    private decodeFromFilter = async (
        filterId: string,
        filterAction: Function | undefined,
        intervalBetweenScans: number
    ) => {
        const video = this.video;

        const canvas = this.createCanvasElement(`${filterId}Canvas`);
        drawFrameOnCanvas(video, canvas);

        const hints = new Map();
        hints.set(3, true); // TRY_HARDER

        const scanner: Scanner = {
            reader: new BrowserMultiFormatReader(hints),
            controls: undefined,
        };

        const decodeFromCanvas = async () => {
            if (typeof filterAction === "function") {
                // filtered scanning
                const filterProps: FilterProps = { video, canvas };
                await filterAction(filterProps);
            }

            try {
                const result = scanner.reader.decodeFromCanvas(canvas);
                this.decodeCallback(undefined, result);
                return true;
            } catch (error) {
                return false;
            }
        };

        if (await decodeFromCanvas()) {
            return;
        }

        const interval = setInterval(async () => {
            if (this.status === STATUS.DONE) {
                clearInterval(interval);
                this.intervals.delete(interval);
                return;
            }

            if (await decodeFromCanvas()) {
                clearInterval(interval);
                this.intervals.delete(interval);
                return;
            }
        }, intervalBetweenScans);

        this.intervals.add(interval);
    };

    // Scanning...

    private scanUsingFilters = async () => {
        // default filter
        await this.decodeFromFilter("default", undefined, INTERVAL_BETWEEN_SCANS);

        // invertedSymbols filter
        await this.decodeFromFilter("invertedSymbols", filters.invertedSymbolsFilter, INTERVAL_BETWEEN_SCANS);
    };

    private startVideoStream = async () => {
        const video = this.video;

        try {
            await video.play();
        } catch (error) {
            console.error("[psk-barcode-scanner] Error while playing video", error);
        }
    };

    private startScanningUsingFrames = async () => {
        await this.startVideoStream();
        await this.scanUsingFilters();
    };

    private startScanningUsingNavigator = async (deviceId: string) => {
        const video = this.video;

        const constraints = {
            video: { facingMode: "environment" },
        };

        if (deviceId && deviceId !== "no-camera") {
            delete constraints.video.facingMode;
            constraints.video["deviceId"] = { exact: deviceId };
        }

        video.onplay = async () => {
            this.status = STATUS.IN_PROGRESS;
            this.cleanupOverlays();
            await this.drawOverlays();
            video.removeAttribute("hidden");
        };

        try {
            video.srcObject = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            this.status = STATUS.ACCESS_DENIED;
            console.error("[psk-barcode-scanner] Error while getting userMedia", error);
        }

        await this.startScanningUsingFrames();
    };

    private startScanning = async (deviceId: string) => {
        switch (this.status) {
            case STATUS.LOAD_CAMERAS:
            case STATUS.CHANGE_CAMERA: {
                this.createVideoElement();

                // if (this.status === STATUS.CHANGE_CAMERA) {
                //     this.stopScanning();
                // }

                // wait until video is in viewport
                await waitUntilElementIsInVisibleInViewport(this.video, 50);

                // request an animation frame
                await waitUntilAnimationFrameIsPossible();

                // start scanning...
                if (this.useFrames) {
                    await this.startScanningUsingFrames();
                } else {
                    await this.startScanningUsingNavigator(deviceId);
                }

                break;
            }
        }
    };

    private stopVideoStream = () => {
        const stream = this.video.srcObject as MediaStream;
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
        this.video.srcObject = null;
    }

    private stopScanning = () => {
        // stop async decode processes started by each filter
        for (const interval of Array.from(this.intervals)) {
            clearInterval(interval);
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

        this.status = STATUS.LOAD_CAMERAS;
    }

    async componentWillRender() {
        if (this.useFrames) {
            return;
        }

        if (this.activeDeviceId) {
            return;
        }

        if (this.devices.length !== 0) {
            return;
        }

        try {
            this.devices = await BrowserMultiFormatReader.listVideoInputDevices();
        } catch (error) {
            console.error("[psk-barcode-scanner] Error while getting video devices", error);
        }

        if (this.devices.length === 0) {
            this.status = STATUS.NO_DETECTION;
        }
    }

    async componentDidRender() {
        await this.startScanning(this.activeDeviceId);
        this.attachOnClickForChangeCamera();
    }

    async disconnectedCallback() {
        this.stopScanning()
        this.stopVideoStream();
    }

    render() {
        return (
            <div part="base" style={style.base}>
                <div id="container" part="container" style={style.container}>
                    <input type="file" accept="video/*" capture="environment" style={style.input} />
                    <div id="content" part="content" innerHTML={this.renderContent()} />
                </div>
            </div>
        );
    }
}
