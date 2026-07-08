import { registerWebModule, NativeModule } from 'expo';

// NotecamModule is not available on the web platform.
class NotecamModule extends NativeModule<{}> {}

export default registerWebModule(NotecamModule, 'NotecamModule');
