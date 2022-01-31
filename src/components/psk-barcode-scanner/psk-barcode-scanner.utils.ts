import filters from "./psk-barcode-scanner.filters";

type ElementDimensions = {
    width: number;
    height: number;
};

export function scale(element: ElementDimensions, screen: ElementDimensions) {
    const r = Math.min(element.width / screen.width, element.height / screen.height);
    const w = screen.width * r;
    const h = screen.height * r;
    return [w, h];
}

export function center(target: ElementDimensions, background: ElementDimensions) {
    const max = {
        width: Math.max(target.width, background.width),
        height: Math.max(target.height, background.height),
    };

    const min = {
        width: Math.min(target.width, background.width),
        height: Math.min(target.height, background.height),
    };

    const x = (max.width - min.width) * 0.5;
    const y = (max.height - min.height) * 0.5;

    return [x, y];
}

export function isElementVisibleInViewport(element) {
    const rect = element.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

export function drawFrameOnCanvas(
    source: HTMLVideoElement | HTMLImageElement,
    canvas: HTMLCanvasElement,
    options: { points?: number[]; stopInternalCropping?: boolean }
) {
    if (!options || typeof options !== "object") {
        options = {};
    }
    if (typeof options.stopInternalCropping !== "boolean") {
        options.stopInternalCropping = false;
    }

    const context = canvas.getContext("2d");

    context.imageSmoothingEnabled = false;

    if (options.points && options.points.length === 6) {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = options.points;
        context.imageSmoothingEnabled = false;
        context.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
        return options.points;
    }

    const inputDimensions = {
        width: canvas.width,
        height: canvas.height,
    };

    if (source instanceof HTMLVideoElement) {
        // console.log("video", { width: source.videoWidth, height: source.videoHeight });
        if (source.videoWidth) {
            inputDimensions.width = source.videoWidth;
            inputDimensions.height = source.videoHeight;
        }
    } else {
        // console.log("image", { width: source.width, height: source.height });
        inputDimensions.width = source.width;
        inputDimensions.height = source.height;
    }

    if (options.stopInternalCropping) {
        canvas.width = inputDimensions.width;
        canvas.height = inputDimensions.height;
        const p = [0, 0, inputDimensions.width, inputDimensions.height, 0, 0, inputDimensions.width, inputDimensions.height];
        context.drawImage.apply(context, [source, ...p]);
        return p;
    }

    let [w, h] = scale(inputDimensions, canvas);

    // console.log(
    //     'screen', {
    //         width: canvas.width,
    //         height: canvas.height,
    //     },
    //     'canvas', {
    //         width: w,
    //         height: h,
    //     },
    //     'frame', {
    //         width: input.width,
    //         height: input.height,
    //     },
    //     'not-rounded', {
    //         width: w,
    //         height: h
    //     }
    // );

    canvas.width = Math.floor(w);
    canvas.height = Math.floor(h);

    let [x, y] = center(canvas, inputDimensions);

    // x = Math.floor(x)
    // y = Math.floor(y)

    let p = [x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height];

    context.drawImage.apply(context, [source, ...p]);

    return p;
}

export function waitUntilElementIsVisibleInViewport(element, delay) {
    return new Promise<void>((resolve) => {
        if (isElementVisibleInViewport(element)) {
            resolve();
            return;
        }

        const interval = setInterval(() => {
            if (isElementVisibleInViewport(element)) {
                resolve();
                clearInterval(interval);
                return;
            }
        }, delay);
    });
}

export function waitUntilAnimationFrameIsPossible() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(resolve);
    });
}

export function waitUntilVideoMetadataIsLoaded(video: HTMLVideoElement) {
    return new Promise<void>((resolve) => {
        video.addEventListener("loadedmetadata", () => resolve(), false);
    });
}

export function setVideoStream(video: HTMLVideoElement, stream: MediaStream) {
    return new Promise<void>((resolve) => {
        video.addEventListener("loadedmetadata", () => resolve(), false);
        video.srcObject = stream;
    });
}

export function createElement(name, props?: any) {
    if (!props) {
        props = {};
    }
    if (!props.style) {
        props.style = {};
    }
    if (!props.text) {
        props.text = "";
    }
    const { style, text } = props;
    delete props.style;
    delete props.text;
    const element = Object.assign(document.createElement(name), props);
    Object.keys(style).forEach((rule) => (element.style[rule] = style[rule]));
    element.innerHTML = text;
    return element as Element;
}

export function snapFrame(video: HTMLVideoElement) {
    const h = video.videoHeight;
    const w = video.videoWidth;

    const canvas = document.createElement("canvas");
    canvas.id = "snapVideo";
    canvas.width = w;
    canvas.height = h;

    const context = canvas.getContext("2d");
    canvas.style.position = "absolute";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "cover";

    context.drawImage(video, 0, 0, w, h);
    video.parentElement.insertBefore(canvas, video);
}

export async function loadFrame(src: string) {
    return new Promise<HTMLImageElement>((resolve) => {
        const image = new Image();
        image.addEventListener("load", () => resolve(image));
        image.src = src;
    });
}

export function captureFrame(canvas: HTMLCanvasElement) {
    if (canvas.id === "invertedSymbols") {
        filters.invertedSymbolsFilter({ canvas });
    }

    return {
        png: canvas.toDataURL("image/png"),
        jpg: canvas.toDataURL("image/jpeg"),
    };
}

export const style = {
    base: {
        display: "grid",
        gridTemplateRows: "1fr",
        width: "100%",
        height: "100%",
    },
    container: {
        position: "relative",
        display: "grid",
        gridTemplateRows: "1fr",
        overflow: "hidden",
        minHeight: "350px",
        padding: "0",
        margin: "0",
    },
    video: {
        height: "100%",
        width: "100%",
        objectFit: "cover",
        position: "absolute",
        top: "0",
    },
    input: {
        display: "none",
    },
    button: {
        position: "absolute",
        zIndex: "1",
        padding: "0.3em 0.6em",
        bottom: "1em",
        left: "50%",
        transform: "translateX(-50%)",
        color: "#FFFFFF",
        background: "transparent",
        borderRadius: "2px",
        border: "2px solid rgba(255, 255, 255, 0.75)",
        fontSize: "15px",
        textAlign: "center",
    },
};
