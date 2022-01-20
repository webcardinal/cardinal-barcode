type FilterProps = {
    canvas: HTMLCanvasElement
};

const filters = {
    invertedSymbolsFilter: (filterProps: FilterProps) => {
        const { canvas } = filterProps;

        const context = canvas.getContext("2d");

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
