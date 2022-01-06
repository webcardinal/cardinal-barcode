type ElementDimensions = {
    width: number,
    height: number
}

/**
 * @param elementDimensions {ElementDimensions} - dimensions obtained from HTMLVideoElement of HTMLImageElement
 * @param screenDimensions {ElementDimensions}
 *
 * Similar behavior with CSS "object-fit: cover" for an HTMLElement
 */
export function computeElementScalingAccordingToScreen(elementDimensions: ElementDimensions, screenDimensions: ElementDimensions) {
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
    }

    if (elementDimensions.height <= elementDimensions.width) {
        computeRatioUsingWidth();

        if (x > 0 && y <= 0) {
            computeRatioUsingHeight()
        }
    } else {
        computeRatioUsingHeight();

        if (x <= 0 && y > 0) {
            computeRatioUsingWidth();
        }
    }

    return [x, y, w, h];
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

export function createElement(name, props?: any) {
    if (!props) {
        props = {};
    }
    if (!props.style) {
        props.style = {};
    }
    if (!props.text) {
        props.text = '';
    }
    const { style, text } = props;
    delete props.style;
    delete props.text;
    const element = Object.assign(document.createElement(name), props);
    Object.keys(style).forEach(rule => element.style[rule] = style[rule]);
    element.innerHTML = text;
    return element as Element;
}

export const style = {
    base: {
        display: 'grid', gridTemplateRows: '1fr',
        width: '100%', height: '100%'
    },
    container: {
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
    invertedVideo: {
        height: '100%', width: '100%',
        objectFit: 'cover',
        position: 'absolute',
        top: '0'
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
        fontSize: '15px',
        textAlign: 'center',
    }
}
