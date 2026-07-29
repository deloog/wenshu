import webview from '@ohos.web.webview';
import { HostBridge } from './HostBridge';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private readonly bridge: HostBridge = new HostBridge();

  build() {
    Column() {
      Web({ src: $rawfile('probe/print.html'), controller: this.controller })
        .javaScriptAccess(true)
        .javaScriptProxy({
          object: this.bridge,
          name: 'wenshuHost',
          methodList: ['registry'],
          controller: this.controller
        })
    }
    .width('100%')
    .height('100%')
  }
}
