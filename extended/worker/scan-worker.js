importScripts("zxing-browser.min.js");

const hints = new Map();
hints.set(3, true); // TRY_HARDER

const { BrowserMultiFormatReader } = ZXingBrowser;

const scanner = new BrowserMultiFormatReader(hints);

addEventListener("message", (e) => {
    const { imageData, width, height, filterId } = e.data;
    const mockCanvas = {
        width,
        height,
        getContext: () => ({
            getImageData: () => imageData,
        }),
    };

    try {
        const bitmap = BrowserMultiFormatReader.createBinaryBitmapFromCanvas(mockCanvas);
        const result = scanner.decodeBitmap(bitmap);
        postMessage({ message: "successful decoding", result, filterId, metadata: { imageData, width, height }});
    } catch (error) {
        postMessage({ message: "failed decoding", error: error.message, filterId });
    }
});
