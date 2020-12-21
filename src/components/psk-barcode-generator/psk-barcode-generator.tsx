import { Component, Element, h, Prop, State, Watch } from '@stencil/core';
import { CustomTheme, BindModel, TableOfContentProperty } from "@cardinal/core";
import { stringToBoolean } from "@cardinal/core";

import bwipjs from "../../../extended/libs/bwip.js";

const TWO_D_BARCODES = ["datamatrix","gs1datamatrix","qrcode"];

@Component({
  tag: 'psk-barcode-generator',
})
export class PskBarcodeGenerator {

  @BindModel() modelHandler;
  @CustomTheme()
  @Element() element;
  @TableOfContentProperty({
    description: `The data-model that will be used for generating the desired barcode.`,
    isMandatory: true,
    propertyType: `string`
  })
  @Prop() data:any;

  @TableOfContentProperty({
    description: `The barcode type. Accepted values are 'gs1datamatrix','datamatrix','qrcode', 'code128','code11','isbn'.`,
    isMandatory: true,
    propertyType: `string`
  })
  @Prop() type:string="qrcode";

  @TableOfContentProperty({
    description: `A title that will be used for the current component instance.`,
    isMandatory: false,
    propertyType: `string`
  })
  @Prop() title: string = "";

  @TableOfContentProperty({
    description: `The size of the barcode in mm. Default is set to 32 mm.`,
    isMandatory: false,
    propertyType: `integer`
  })
  @Prop() size?:any = 32;
  @TableOfContentProperty({
    description: `This option allows to print the input data below the generated barcode.`,
    isMandatory: false,
    propertyType: `boolean`
  })
  @Prop() includeText:boolean = false;
  @State() isLoaded = false;

  @Watch("data")
  drawQRCodeCanvas(){
    if(this.isLoaded && this.data.length>0){
      let canvas = this.element.querySelector("canvas");
      canvas.innerHTML="";

      let tryToGenerateBarcode = () => {
        // @ts-ignore
        if (bwipjs) {
          try{
            let options =  {
              bcid: this.type,      // Barcode type
              text: this.data,      // Text to encode
              scale: 3,             // 3x scaling factor
              height: this.size,    // Bar height, in millimeters
              textxalign: 'center', // Always good to set this
            }

            if (stringToBoolean(this.includeText)) {
              options['alttext'] = this.data;
            }

            if (TWO_D_BARCODES.indexOf(this.type)!==-1) {
              options['width'] = this.size;
            }

            // @ts-ignore
            bwipjs.toCanvas(canvas,options, function (err) {
              if (err) {
                console.log(err);
              }
            });
          } catch (e) {
            // most commonly errors come from wrong input data format
          }

        } else {
          setTimeout(tryToGenerateBarcode, 100);
        }
      }
      tryToGenerateBarcode();
    }
  }

  componentDidLoad(){
    this.isLoaded = true;
    this.drawQRCodeCanvas();
  }

  render() {
    return (
      <psk-card title={this.title}>
        <div class="code_container">
          <div class="card-body text-center">
            <canvas class="code_canvas"/>
          </div>
        </div>
      </psk-card>
    );
  }
}

