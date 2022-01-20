type ElementDimensions = {
    width: number;
    height: number;
};

/**
 * @param elementDimensions {ElementDimensions} - dimensions obtained from HTMLVideoElement of HTMLImageElement
 * @param screenDimensions {ElementDimensions}
 *
 * Similar behavior with CSS "object-fit: cover" for an HTMLElement
 */
export function computeElementScalingAccordingToScreen(
    elementDimensions: ElementDimensions,
    screenDimensions: ElementDimensions
) {
    let x, y, w, h;

    const computeRatioUsingWidth = () => {
        const r = screenDimensions.height / elementDimensions.height;

        w = elementDimensions.width * r;
        h = screenDimensions.height;

        x = (screenDimensions.width - w) * 0.5;
        y = 0;
    };

    const computeRatioUsingHeight = () => {
        const r = screenDimensions.width / elementDimensions.width;

        w = screenDimensions.width;
        h = elementDimensions.height * r;

        x = 0;
        y = (screenDimensions.height - h) * 0.5;
    };

    if (elementDimensions.height <= elementDimensions.width) {
        computeRatioUsingWidth();

        if (x > 0 && y <= 0) {
            computeRatioUsingHeight();
        }
    } else {
        computeRatioUsingHeight();

        if (x <= 0 && y > 0) {
            computeRatioUsingWidth();
        }
    }

    return [x, y, w, h];
}

// export function computeElementScalingAccordingToCanvas(
//     elementDimensions: ElementDimensions,
//     canvasDimensions: ElementDimensions
// ) {
//     const [w, h] = scaleScreenToInput(canvasDimensions, elementDimensions);
//
//     const newCanvasDimensions: ElementDimensions = { width: w, height: h };
//
//     const [x, y] = centerElementInElement(newCanvasDimensions, elementDimensions);
//
//     return [x, y, w, h];
// }

// export function scaleScreenToInput(canvasDimensions: ElementDimensions, elementDimensions: ElementDimensions, ) {
//     let w, h;
//
//     // 1
//     const rWidth = canvasDimensions.width / elementDimensions.width;
//
//     // 2
//     w = elementDimensions.width;
//
//     // 3
//     h = elementDimensions.height * rWidth;
//
//     // 4
//     if (h <= elementDimensions.height) {
//         // center
//         return [w, h];
//     }
//
//     // 5
//     const rHeight = elementDimensions.height / h;
//
//     // 6
//     h = elementDimensions.height;
//
//     // 7
//     w = elementDimensions.width * rHeight;
//
//     return [w, h];
// }

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

// function centerElementInElement(target: ElementDimensions, background: ElementDimensions) {
//     const max = {
//         width: Math.max(target.width, background.width),
//         height: Math.max(target.height, background.height),
//     };
//
//     const min = {
//         width: Math.min(target.width, background.width),
//         height: Math.min(target.height, background.height),
//     };
//
//     const x = (max.width - min.width) * 0.5;
//     const y = (max.height - min.height) * 0.5;
//
//     return [x, y];
// }

// export function computeElementScalingAccordingToCanvas(
//     elementDimensions: ElementDimensions,
//     canvasDimensions: ElementDimensions
// ) {
//     let x, y, w, h;
//
//     const computeRatioUsingWidth = () => {
//         const r = canvasDimensions.height / elementDimensions.height;
//
//         w = elementDimensions.width * r;
//         h = canvasDimensions.height;
//
//         x = (canvasDimensions.width - w) * 0.5;
//         y = 0;
//     };
//
//     const computeRatioUsingHeight = () => {
//         const r = canvasDimensions.width / elementDimensions.width;
//
//         w = canvasDimensions.width;
//         h = elementDimensions.height * r;
//
//         x = 0;
//         y = (canvasDimensions.height - h) * 0.5;
//     };
//
//     if (elementDimensions.height <= elementDimensions.width) {
//         computeRatioUsingWidth();
//
//         if (x > 0 && y <= 0) {
//             computeRatioUsingHeight();
//         }
//     } else {
//         computeRatioUsingHeight();
//
//         if (x <= 0 && y > 0) {
//             computeRatioUsingWidth();
//         }
//     }
//
//     return [x, y, w, h];
// }

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
    options: { points?: number[] } = {}
) {
    if (!options)  {
        options = {};
    }

    const input = {
        width: canvas.width,
        height: canvas.height
    };

    if (source instanceof HTMLVideoElement) {
        // console.log("video", { width: source.videoWidth, height: source.videoHeight });

        if (source.videoWidth) {
            input.width = source.videoWidth
            input.height = source.videoHeight
        }
    } else {
        // console.log("image", { width: source.width, height: source.height });

        input.width = source.width;
        input.height = source.height;
    }

    // console.log("canvas [1]", canvas.id, { width: canvas.width, height: canvas.height });

    const context = canvas.getContext("2d");

    if (options.points && options.points.length === 6) {
        const [sx, sy, sw, sh, dx, dy, dw, dh] = options.points;
        context.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
        return options.points;
    }

    // if (options.isVisible) {
    //     const [x, y, w, h] = computeElementScalingAccordingToScreen(input, canvas);
    //     context.drawImage(source, x, y, w, h);
    //     return;
    // }

    const [w, h] = scale(input, canvas);
    const [x, y] = center({ width: w, height: h }, input);

    canvas.width = w;
    canvas.height = h;

    // console.log('context', { x, y, w, h, source });

    // context.fillStyle = "#FF000050";
    // context.fillRect(0, 0, w, h);

    context.drawImage(source, x, y, w, h, 0, 0, w, h);

    return [x, y, w, h, 0, 0, w, h]

    // console.log("canvas [2]", canvas.id, { width: canvas.width, height: canvas.height });

    // const src = canvas.toDataURL("image/png");
    // const a = document.createElement('a');
    // a.href = src;
    // a.download = "canvas.png";
    // document.body.appendChild(a);
    // a.click();
    // document.body.removeChild(a);
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

export function captureFrame(video: HTMLVideoElement) {
    const canvas = document.createElement("canvas");
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    const [x, y, w, h] = computeElementScalingAccordingToScreen(
        {
            width: video.videoWidth,
            height: video.videoHeight,
        },
        canvas
    );

    const context = canvas.getContext("2d");
    context.drawImage(video, x, y, w, h);
    return canvas.toDataURL("image/jpeg");
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
