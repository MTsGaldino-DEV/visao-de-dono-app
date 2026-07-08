import NotecamModule from './src/NotecamModule';

export async function takePhotoAsync(): Promise<string> {
  return await NotecamModule.takePhotoAsync();
}
