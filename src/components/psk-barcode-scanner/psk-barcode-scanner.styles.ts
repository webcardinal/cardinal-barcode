export const getCleanupStyleForShadowDOM = () => {
    // It resets the default shadow dom styles from Apple
    const style = document.createElement('style');
    style.append(`
*::-webkit-media-controls-panel {
  display: none !important;
  -webkit-appearance: none;
}
*::-webkit-media-controls-play-button {
  display: none !important;
  -webkit-appearance: none;
}
*::-webkit-media-controls-start-playback-button {
  display: none !important;
  -webkit-appearance: none;
}`
    )
    return style.innerHTML;
}

export default {
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
