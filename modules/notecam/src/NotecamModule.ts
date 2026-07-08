import { NativeModule, requireNativeModule } from 'expo';

declare class NotecamModule extends NativeModule<{}> {
  takePhotoAsync(): Promise<string>;
}

export default requireNativeModule<NotecamModule>('NotecamModule');
