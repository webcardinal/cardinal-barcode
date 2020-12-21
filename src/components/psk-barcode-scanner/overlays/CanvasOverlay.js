export default class CanvasOverlay {

  constructor(scannerContainer) {
    this.scannerContainer = scannerContainer;

    if (!window.cardinal['barcodeScanner']) {
      this.dimensions = this.getDimensions(this.scannerContainer);
      window.cardinal.barcodeScanner = {
        dimensions: this.dimensions
      };
    }
    else {
      this.dimensions = window.cardinal['barcodeScanner'].dimensions;
    }
  }

  getDimensions(scannerContainer) {
    let buttonHeight = 40;
    return {
      width: scannerContainer.offsetWidth,
      height: scannerContainer.offsetHeight,
      frame: 0.75 * Math.min(scannerContainer.offsetWidth, scannerContainer.offsetHeight) - buttonHeight
    }
  }

  addCanvasToView(canvasId, customStyle) {
    let canvasElement = document.createElement('canvas');
    canvasElement.id = canvasId;
    canvasElement.width = this.dimensions.width;
    canvasElement.height= this.dimensions.height;
    canvasElement.style.position = 'absolute';
    canvasElement.style.width = '100%';
    canvasElement.style.top = '0';
    canvasElement.style.left = '0';

    if (typeof customStyle === 'object') {
      Object.keys(customStyle).forEach(key => {
        if (canvasElement.style[key])
          canvasElement.style[key] = customStyle[key];
      })
    }

    this.scannerContainer.appendChild(canvasElement);
    return canvasElement;
  }
}
