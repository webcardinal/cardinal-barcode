# psk-barcode-scanner



<!-- Auto Generated Below -->


## Properties

| Property               | Attribute                | Description                                                                                                                                                                      | Type      | Default     |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| `data`                 | `data`                   | The model-handler scope that will be updated with the retrieved data from the scanner.                                                                                           | `string`  | `undefined` |
| `snapVideo`            | `snap-video`             | Decides if a screenshot is made after scanning.                                                                                                                                  | `boolean` | `false`     |
| `stopInternalCropping` | `stop-internal-cropping` | Decides if the received frame should be cropped according with the screen aspect-ration.                                                                                         | `boolean` | `false`     |
| `useFrames`            | `use-frames`             | If <code>true</code>, setFrames can be used and custom frames will be scanned.                                                                                                   | `boolean` | `false`     |
| `useLogs`              | `use-logs`               | Decides if internal status of component is logged into the console.                                                                                                              | `boolean` | `true`      |
| `useWebWorker`         | `use-web-worker`         | If <code>true</code>, a Web Worker (scanner-worker.js) will be instantiated. Its purpose is to decode codes.  If <code>false</code> decoding will take place in the main thread. | `boolean` | `true`      |


## Methods

### `setFrame(src: string) => Promise<void>`



#### Returns

Type: `Promise<void>`



### `switchCamera() => Promise<void>`



#### Returns

Type: `Promise<void>`




## Shadow Parts

| Part          | Description |
| ------------- | ----------- |
| `"base"`      |             |
| `"container"` |             |
| `"content"`   |             |
| `"frame"`     |             |
| `"video"`     |             |


----------------------------------------------

*Made by [WebCardinal](https://github.com/webcardinal) contributors.*
