export enum STATUS {
    INIT = "Initializing component...",
    LOADING_CAMERAS = "Detecting your cameras...",
    DETECTION_STARTED = "Detection is starting...",
    DETECTION_IN_PROGRESS = "Detection in progress...",
    DETECTION_DONE = "Detection is stopping...",
    NO_DETECTION = "No camera detected.",
    ACCESS_DENIED = "Access denied",
    CHANGE_CAMERA = "Change camera",
}

export class InternalState {
    private _status: STATUS;
    private readonly _isLogging: boolean;

    constructor(status: STATUS, isLogging: boolean) {
        this._status = status;
        this._isLogging = isLogging;
    }

    set status(status) {
        this._status = status;

        if (this._isLogging) {
            console.log("[psk-barcode-scanner] Status:", this._status);
        }
    }

    get status() {
        return this._status;
    }
}
