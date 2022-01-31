# psk-barcode-scanner



<!-- Auto Generated Below -->


## Properties

| Property               | Attribute                | Description                                                                            | Type      | Default     |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------------------- | --------- | ----------- |
| `data`                 | `data`                   | The model-handler scope that will be updated with the retrieved data from the scanner. | `string`  | `undefined` |
| `noLogs`               | `no-logs`                | Decides if internal status of component is logged.                                     | `boolean` | `false`     |
| `snapVideo`            | `snap-video`             | Decides if a screenshot is made after scanning.                                        | `boolean` | `false`     |
| `stopInternalCropping` | `stop-internal-cropping` |                                                                                        | `boolean` | `false`     |
| `useFrames`            | `use-frames`             | If <code>true</code>, setFrames can be used and custom frames will be scanned.         | `boolean` | `false`     |


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
