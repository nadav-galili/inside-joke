// Metro bundles images and videos and hands the import back as an asset id.
declare module '*.png' {
  const asset: number;
  export default asset;
}
declare module '*.jpg' {
  const asset: number;
  export default asset;
}
declare module '*.mp4' {
  const asset: number;
  export default asset;
}
