import { computeElementScalingAccordingToScreen } from "./psk-barcode-scanner.utils";

type FilterProps = {
    video: HTMLVideoElement
    canvas: HTMLCanvasElement
};

const filters = {
    invertedSymbolsFilter: (filterProps: FilterProps) => {
        const { video, canvas } = filterProps;

        // scale video according to screen dimensions
        const [x, y, w, h] = computeElementScalingAccordingToScreen(
            { width: video.videoWidth, height: video.videoHeight },
            canvas
        );

        const context = canvas.getContext("2d");
        context.drawImage(video, x, y, w, h);

        // invert colors of the current frame
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = image.data[i] ^ 255;
            image.data[i + 1] = image.data[i + 1] ^ 255;
            image.data[i + 2] = image.data[i + 2] ^ 255;
        }
        context.putImageData(image, 0, 0);
    },
};

export default filters;
export type { FilterProps }
