import { Build, Component, Prop, State, Element, Method, h } from "@stencil/core";
import type { HTMLStencilElement } from "@stencil/core/internal";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BindModel } from "@cardinal/internals";

import audio from "./audio";
import {
    captureFrame,
    createElement,
    drawFrameOnCanvas,
    loadFrame,
    setVideoStream,
    snapFrame,
    style,
    waitUntilAnimationFrameIsPossible,
    waitUntilElementIsVisibleInViewport,
} from "./psk-barcode-scanner.utils";
import filters from "./psk-barcode-scanner.filters";
import type { FilterProps } from "./psk-barcode-scanner.filters";

type Scanner = {
    reader: BrowserMultiFormatReader;
    controls: any;
};
type Frame = {
    canvas: HTMLCanvasElement;
    source: HTMLImageElement | HTMLVideoElement;
    points: number[];
};

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
     * Decides if internal status of component is logged.
     */
    @Prop() noLogs = false;

    /**
     * If <code>true</code>, setFrames can be used and custom frames will be scanned.
     */
    @Prop({ reflect: true }) useFrames = false;

    @State() status: STATUS = STATUS.INIT;

    @State() activeDeviceId: string;

    private video: HTMLVideoElement;

    private container: HTMLDivElement;

    private intervals: Set<number> = new Set<number>();

    private devices: MediaDeviceInfo[] = [];

    private frame: Frame = {
        canvas: null as HTMLCanvasElement,
        source: null as HTMLImageElement | HTMLVideoElement,
        points: [],
    };

    private overlay;

    constructor() {
        window.addEventListener("resize", () => {
            window.requestAnimationFrame(async () => {
                this.cleanupOverlays();
                await this.drawOverlays();
            });
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

    // Event handlers

    private onVideoPlay = async () => {
        this.status = STATUS.IN_PROGRESS;
        this.cleanupOverlays();
        await this.drawOverlays();
        this.video.removeAttribute("hidden");
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
        const canvas = this.frame.canvas.cloneNode() as HTMLCanvasElement;

        canvas.id = filterId;

        drawFrameOnCanvas(this.frame.source, canvas, { points: this.frame.points });

        // this.host.shadowRoot.append(canvas)

        const hints = new Map();
        hints.set(3, true); // TRY_HARDER

        const scanner: Scanner = {
            reader: new BrowserMultiFormatReader(hints),
            controls: undefined,
        };

        const decodeFromCanvas = async () => {
            if (this.status === STATUS.DONE) {
                return true;
            }

            if (!this.useFrames) {
                drawFrameOnCanvas(this.frame.source, canvas, { points: this.frame.points });
            }

            if (typeof filterAction === "function") {
                // filtered scanning
                const filterProps: FilterProps = { canvas };
                await filterAction(filterProps);
            }

            try {
                const result = scanner.reader.decodeFromCanvas(canvas) as any;
                result.filter = { name: filterId, width: canvas.width, height: canvas.height };
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
        const defaultFilter = this.decodeFromFilter("default", undefined, INTERVAL_BETWEEN_SCANS);

        // invertedSymbols filter
        const invertedSymbolsFilter = this.decodeFromFilter(
            "invertedSymbols",
            filters.invertedSymbolsFilter,
            INTERVAL_BETWEEN_SCANS
        );

        await Promise.all([defaultFilter, invertedSymbolsFilter]);
    };

    private startScanningUsingFrames = async () => {
        this.status = STATUS.IN_PROGRESS;
        await this.scanUsingFilters();
    };

    private startScanningUsingNavigator = async (deviceId: string) => {
        const video = this.video;

        const constraints = {
            audio: false,
            video: {
                facingMode: "environment",
                width: { min: this.container.offsetWidth, ideal: 3 * this.container.offsetWidth },
                height: { min: this.container.offsetHeight, ideal: 3 * this.container.offsetHeight },
            },
        };

        if (deviceId && deviceId !== "no-camera") {
            delete constraints.video.facingMode;
            constraints.video["deviceId"] = { exact: deviceId };
        }

        try {
            const canvas = createElement("canvas", {
                id: "videoCanvas",
                width: this.container.offsetWidth,
                height: this.container.offsetHeight,
            }) as HTMLCanvasElement;
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            await setVideoStream(this.video, stream);
            const points = drawFrameOnCanvas(this.video, canvas);
            this.frame = { canvas, source: this.video, points };
        } catch (error) {
            this.status = STATUS.ACCESS_DENIED;
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
                    break;
                }
            }
        } catch (error) {
            console.error("[psk-barcode-scanner] Error while getting activeDeviceId", error);
        }

        await this.scanUsingFilters();
    };

    private startScanning = async (deviceId: string) => {
        switch (this.status) {
            case STATUS.LOAD_CAMERAS:
            case STATUS.CHANGE_CAMERA: {
                // wait until video is in viewport
                await waitUntilElementIsVisibleInViewport(this.video, 50);

                // request an animation frame
                await waitUntilAnimationFrameIsPossible();

                // start scanning...
                if (!this.useFrames) {
                    this.status = STATUS.IN_PROGRESS;
                    await this.startScanningUsingNavigator(deviceId);
                }

                break;
            }
        }
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
        // stop async decode processes started by each filter
        for (const interval of Array.from(this.intervals)) {
            clearInterval(interval);
        }
    };

    // Public Methods

    @Method()
    async switchCamera() {
        const ids = this.devices.map((device) => device.deviceId);

        const currentIndex = ids.indexOf(this.activeDeviceId);

        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % ids.length;

        this.activeDeviceId = ids[nextIndex];

        this.status = STATUS.CHANGE_CAMERA;

        this.stopScanning();

        this.stopVideoStream();
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
            canvas.width = this.container.offsetWidth;
            canvas.height = this.container.offsetHeight;

            const points = drawFrameOnCanvas(image, canvas);

            canvas.hidden = false

            await this.onVideoPlay();

            this.frame = { canvas, source: image, points };

            await this.startScanningUsingFrames();

            return;
        }

        drawFrameOnCanvas(this.frame.source, this.frame.canvas);
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
        this.initializeReferencesToElements();

        await this.startScanning(this.activeDeviceId);

        this.attachOnClickForChangeCamera();
    }

    async disconnectedCallback() {
        this.stopScanning();
        this.stopVideoStream();
    }

    render() {
        return [
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
