import { Component, Prop, State, Element, Method, h } from "@stencil/core";
import type { HTMLStencilElement } from "@stencil/core/internal";
import { BrowserMultiFormatReader } from "@zxing/browser";

import { BindModel } from "@cardinal/internals";

import audio from "./audio";
import {
    captureFrame,
    cloneCanvas,
    createElement,
    drawFrameOnCanvas,
    getFromLocalStorage,
    loadFrame,
    setInLocalStorage,
    setVideoStream,
    snapFrame,
    timeout,
    waitUntilAnimationFrameIsPossible,
    waitUntilElementIsVisibleInViewport,
} from "./psk-barcode-scanner.utils";
import style, { getCleanupStyleForShadowDOM } from "./psk-barcode-scanner.styles";
import filters from "./psk-barcode-scanner.filters";
import type { FilterProps } from "./psk-barcode-scanner.filters";
import { InternalState, STATUS } from "./psk-barcode-scanner.status";

type Frame = {
    canvas: HTMLCanvasElement;
    source: HTMLImageElement | HTMLVideoElement;
    points: number[];
    filters: Function[];
};

const KEY_ACTIVE_DEVICE = "psk-scanner-device-id";

// INTERVAL_BETWEEN_SCANS is used when Web Workers are deliberate disabled
// const INTERVAL_BETWEEN_SCANS = 1000;   // 1fr/s
const INTERVAL_BETWEEN_SCANS = 250;       // 4fr/s
// const INTERVAL_BETWEEN_SCANS = 125;    // 8fr/s
// const INTERVAL_BETWEEN_SCANS = 25;     // 40fr/s
// const INTERVAL_BETWEEN_SCANS = 50 / 3; // 60fs/s

const DEV_FLAGS = {
    ACTIVATE_INTERNAL_CANVASES: "dev-activate-internal-canvases",
    DISABLE_SOME_SLOTS: "dev-disable-some-slots",
};

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
    @Prop({ mutable: true }) data: string;

    /**
     * Decides if a screenshot is made after scanning.
     */
    @Prop() snapVideo = false;

    /**
     * If <code>true</code>, setFrames can be used and custom frames will be scanned.
     */
    @Prop({ reflect: true }) useFrames = false;

    /**
     * If <code>true</code>, a Web Worker (scanner-worker.js) will be instantiated.
     * Its purpose is to decode codes.
     *
     * If <code>false</code> decoding will take place in the main thread.
     */
    @Prop({ reflect: true }) useWebWorker = true;

    /**
     * Decides if internal status of component is logged into the console.
     */
    @Prop() useLogs = true;

    /**
     * Decides if the received frame should be cropped according with the screen aspect-ration.
     */
    @Prop() stopInternalCropping = false;

    @State() activeDeviceId: string;

    private state = new InternalState(STATUS.INIT, this.useLogs);

    private video: HTMLVideoElement;

    private container: HTMLDivElement;

    private devices: MediaDeviceInfo[] = [];

    private frame: Frame = {
        canvas: null as HTMLCanvasElement,
        source: null as HTMLImageElement | HTMLVideoElement,
        points: [],
        filters: [],
    };

    private scanner: BrowserMultiFormatReader;

    private scanWorker: Worker;

    private overlay;

    private useMetadata: boolean;

    constructor() {
        window.addEventListener("resize", async () => {
            await waitUntilAnimationFrameIsPossible();
            this.cleanupOverlays();
            await this.drawOverlays();
        });
    }

    // Pre-rendering...

    private initializeReferencesToElements = () => {
        const container = this.host.shadowRoot.querySelector("#container") as HTMLDivElement;
        if (!container) {
            console.error("[psk-barcode-scanner] Component can not render #container");
            return;
        }

        const video = this.host.shadowRoot.querySelector("#video") as HTMLVideoElement;
        if (!video) {
            console.error("[psk-barcode-scanner] Component can not render #video");
            return;
        }

        this.container = container;
        this.video = video;
    };

    private createSlotElement = (name) => {
        if (this.host.querySelector(`[slot=${name}]`)) {
            return createElement("slot", { name });
        }
        templates[name].part = name;
        return templates[name];
    };

    private attachOnClickForChangeCamera = () => {
        const toggle = this.host.shadowRoot.querySelector("[change-camera]") as HTMLButtonElement;
        if (toggle) {
            toggle.onclick = async () => await this.switchCamera();
        }
    };

    private renderContent = () => {
        let element;
        switch (this.state.status) {
            case STATUS.INIT:
                element = this.createSlotElement("init");
                break;
            case STATUS.NO_DETECTION:
                element = this.createSlotElement("error");
                break;
            case STATUS.DETECTION_DONE:
                element = this.createSlotElement("done");
                break;
            case STATUS.LOADING_CAMERAS:
                if (this.host.hasAttribute(DEV_FLAGS.DISABLE_SOME_SLOTS)) {
                    element = "";
                    return;
                }

                element = this.createSlotElement("feedback");
                break;
            case STATUS.ACCESS_DENIED:
                element = this.createSlotElement("access_denied");
                break;
            default: {
                if (this.host.hasAttribute(DEV_FLAGS.DISABLE_SOME_SLOTS)) {
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

    // Event handlers

    private onVideoPlay = async () => {
        this.cleanupOverlays();
        await this.drawOverlays();
        this.video.removeAttribute("hidden");
    };

    private onCanvasPlay = async () => {
        this.cleanupOverlays();
        await this.drawOverlays();
        this.frame.canvas.removeAttribute("hidden");
    };

    // Scanning & Decoding...

    private decodeCallback = (error, result, payload) => {
        if (result && this.state.status === STATUS.DETECTION_IN_PROGRESS) {
            this.stopScanning();

            if (this.useLogs) {
                console.log("[psk-barcode-scanner] Scanned data:", result);
            }

            if (this.modelHandler) {
                audio.play();

                if (this.overlay) {
                    this.overlay.drawOverlay(result.resultPoints);
                }

                if (this.snapVideo) {
                    snapFrame(this.video);
                }

                if (this.useMetadata) {
                    result.frames = captureFrame(payload.canvas);
                    result.video = {
                        width: this.video.videoWidth,
                        height: this.video.videoHeight,
                    };
                    result.useWebWorker = this.useWebWorker;

                    try {
                        result.container = JSON.parse(JSON.stringify(this.container.getBoundingClientRect()));
                    } catch (e) {
                        console.error("[psk-barcode-scanner] Could not log container dimensions!");
                    }

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

    private decode = async (canvas: HTMLCanvasElement, filterAction: Function | undefined) => {
        if (this.state.status === STATUS.DETECTION_DONE) {
            return;
        }

        drawFrameOnCanvas(this.frame.source, canvas, {
            points: this.frame.points,
            stopInternalCropping: this.stopInternalCropping,
        });

        const filterId = canvas.id;

        if (typeof filterAction === "function") {
            // filtered scanning
            const filterProps: FilterProps = { canvas };
            await filterAction(filterProps);
        }

        // decoding in main thread
        if (!this.useWebWorker) {
            try {
                const result = this.scanner.decodeFromCanvas(canvas) as any;
                result.filter = { name: filterId, width: canvas.width, height: canvas.height };
                this.decodeCallback(undefined, result, { canvas });
            } catch (error) {
                this.decodeCallback(error, undefined, undefined);
            }
            return;
        }

        // decoding in web worker
        const context = canvas.getContext("2d");
        const { width, height } = canvas;
        const imageData = context.getImageData(0, 0, width, height);
        this.scanWorker.postMessage({ message: "start decoding", imageData, width, height, filterId });
    };

    private scan = async () => {
        await Promise.all(this.frame.filters.map((filter) => filter()));
    };

    private createFilter = (filterId: string, filterAction: Function | undefined) => {
        const canvas = cloneCanvas(this.frame.canvas);
        canvas.id = filterId;
        canvas.style.width = "unset";
        canvas.style.height = "unset";

        if (this.host.hasAttribute(DEV_FLAGS.ACTIVATE_INTERNAL_CANVASES)) {
            canvas.style.position = "fixed";
            canvas.style.left = "0";
            canvas.style.top = "0";
            canvas.style.objectFit = "unset";
            canvas.style.zIndex = "1000";
            canvas.style.display = "none";
            this.host.shadowRoot.append(canvas);
        }

        const filter = () => this.decode(canvas, filterAction);
        this.frame.filters.push(filter);
    };

    private createFilters = async () => {
        if (!this.useWebWorker) {
            const hints = new Map();
            hints.set(3, true); // TRY_HARDER
            this.scanner = new BrowserMultiFormatReader(hints);

            // this mechanism is not recommended since de UI thread is slowed down
            const scanInterval = async () => {
                await this.scan();
                await timeout(INTERVAL_BETWEEN_SCANS);
                await scanInterval();
            };
            scanInterval();
        } else {
            const filters = new Set<string>();
            this.scanWorker.addEventListener("message", async (e) => {
                const { error, result, filterId, metadata } = e.data;

                if (error && !this.useFrames) {
                    filters.add(filterId);
                    if (filters.size === this.frame.filters.length) {
                        filters.clear();
                        await this.scan();
                    }
                }

                let workerCanvas = undefined;
                if (!error && this.useMetadata) {
                    workerCanvas = createElement("canvas", {
                        id: filterId,
                        width: metadata.width,
                        height: metadata.height,
                    });
                    workerCanvas.getContext("2d").putImageData(metadata.imageData, 0, 0);
                }

                this.decodeCallback(error, result, { canvas: workerCanvas });
            });
            this.scanWorker.addEventListener("error", (e) => {
                console.error("[psk-barcode-scanner] scan-worker error", e);
            });
        }

        // default filter
        this.createFilter("default", undefined);

        // invertedSymbols filter
        this.createFilter("invertedSymbols", filters.invertedSymbolsFilter);
    };

    private startVideoStream = async (deviceId: string) => {
        let width = this.container.offsetWidth;
        let height = this.container.offsetHeight;

        // since stencil-router uses display "none" in order to avoid flickering
        // values for offset/client dimensions will be 0
        // so in order to get real values
        if (window.WebCardinal?.state?.page?.loader && width === 0) {
            const stencilRoute = window.WebCardinal.state.page.loader.parentElement;
            const display = stencilRoute.style.display;

            stencilRoute.style.display = "unset";

            width = this.container.offsetWidth;
            height = this.container.offsetHeight;

            if (window?.cardinal?.barcodeScanner?.dimensions) {
                window.cardinal.barcodeScanner.dimensions.width = width;
                window.cardinal.barcodeScanner.dimensions.height = height;
            }

            stencilRoute.style.display = display;
        }

        const video = this.video;

        const constraints = {
            audio: false,
            video: {
                facingMode: "environment",
                width: { ideal: 3 * width },
                height: { ideal: 3 * height },
            },
        };

        if (deviceId && deviceId !== "no-camera") {
            delete constraints.video.facingMode;
            constraints.video["deviceId"] = { exact: deviceId };
        }

        try {
            const canvas = createElement("canvas", { id: "videoCanvas", width, height }) as HTMLCanvasElement;
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            await setVideoStream(video, stream);
            const points = drawFrameOnCanvas(video, canvas, {
                stopInternalCropping: this.stopInternalCropping,
            });
            this.frame = { canvas, source: video, points, filters: [] };
        } catch (error) {
            this.state.status = STATUS.ACCESS_DENIED;
            console.error("[psk-barcode-scanner] Error while getting userMediaStream", error);
        }

        if (!video.srcObject) {
            return;
        }

        try {
            const stream = video.srcObject as MediaStream;
            const tracks = stream.getVideoTracks();
            for (let i = 0; i < tracks.length; i++) {
                const device = tracks[i];
                if (device.readyState === "live") {
                    this.activeDeviceId = device.getSettings().deviceId;
                    setInLocalStorage(KEY_ACTIVE_DEVICE, this.activeDeviceId);
                    break;
                }
            }
        } catch (error) {
            console.error("[psk-barcode-scanner] Error while getting activeDeviceId", error);
        }

        await this.createFilters();

        await this.scan();
    };

    private stopVideoStream = () => {
        if (!this.video) {
            return;
        }
        const stream = this.video.srcObject as MediaStream;
        if (!stream) {
            return;
        }
        const tracks = stream.getTracks();
        tracks.forEach((track) => track.stop());
        this.video.srcObject = null;
    };

    private stopScanning = () => {
        this.state.status = STATUS.DETECTION_DONE;

        // stop web worker
        if (this.scanWorker) {
            this.scanWorker.terminate();
        }
    };

    // Public Methods

    @Method()
    async switchCamera() {
        const ids = this.devices.map((device) => device.deviceId);

        const currentIndex = ids.indexOf(this.activeDeviceId);

        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % ids.length;

        this.activeDeviceId = ids[nextIndex];

        this.stopScanning();

        this.stopVideoStream();

        this.state.status = STATUS.CHANGE_CAMERA;
    }

    @Method()
    async setFrame(src: string) {
        if (!this.useFrames) {
            return;
        }

        if (!this.host || !this.host.shadowRoot) {
            await this.host.componentOnReady();
        }

        const image = await loadFrame(src);

        if (!this.frame.canvas) {
            const canvas = this.host.shadowRoot.querySelector("#frame") as HTMLCanvasElement;
            const { width, height } = this.container.getBoundingClientRect();

            canvas.width = Math.floor(width);
            canvas.height = Math.floor(height);

            const points = drawFrameOnCanvas(image, canvas, {
                stopInternalCropping: this.stopInternalCropping,
            });

            this.frame = { canvas, source: image, points, filters: [] };

            await this.onCanvasPlay();

            await this.createFilters();

            await this.scan();

            return;
        }

        this.frame.source = image;

        drawFrameOnCanvas(this.frame.source, this.frame.canvas, {
            stopInternalCropping: this.stopInternalCropping,
        });

        await this.scan();
    }

    // Lifecycle

    async componentWillLoad() {
        if (!this.host.isConnected) {
            return;
        }

        this.state.status = STATUS.LOADING_CAMERAS;

        try {
            this.devices = await BrowserMultiFormatReader.listVideoInputDevices();
        } catch (error) {
            console.error("[psk-barcode-scanner] Error while getting video devices", error);
        }

        if (this.host.hasAttribute("results")) {
            this.useMetadata = true;
        }

        if (this.useWebWorker) {
            this.scanWorker = new Worker("webcardinal/extended/cardinal-barcode/worker/scan-worker.js");
        }

        if (this.useFrames) {
            this.state.status = STATUS.DETECTION_STARTED;
            return;
        }

        const preferredDeviceId = getFromLocalStorage(KEY_ACTIVE_DEVICE);
        if (preferredDeviceId) {
            this.activeDeviceId = preferredDeviceId;
        }

        if (this.devices.length === 0) {
            this.state.status = STATUS.NO_DETECTION;
            return;
        }

        this.state.status = STATUS.DETECTION_STARTED;
    }

    async componentDidRender() {
        switch (this.state.status) {
            case STATUS.DETECTION_STARTED:
            case STATUS.CHANGE_CAMERA: {
                this.state.status = STATUS.DETECTION_IN_PROGRESS;

                // initialize references and listeners to DOM elements
                this.initializeReferencesToElements();
                this.attachOnClickForChangeCamera();

                // wait until video is in viewport
                await waitUntilElementIsVisibleInViewport(this.video, 50);

                // request an animation frame
                await waitUntilAnimationFrameIsPossible();

                if (!this.useFrames) {
                    await this.startVideoStream(this.activeDeviceId);
                }
            }
        }
    }

    async disconnectedCallback() {
        this.stopScanning();
        this.stopVideoStream();
    }

    render() {
        return [
            <style>{getCleanupStyleForShadowDOM()}</style>,
            <div part="base" style={style.base}>
                <div id="container" part="container" style={style.container}>
                    <input type="file" accept="video/*" capture="environment" style={style.input} />
                    <video
                        id="video"
                        part="video"
                        onPlay={this.onVideoPlay}
                        autoplay
                        playsinline
                        hidden
                        style={style.video}
                    />
                    <canvas id="frame" part="frame" hidden style={style.video} />
                    <div id="content" part="content" innerHTML={this.renderContent()} />
                </div>
            </div>,
        ];
    }
}
