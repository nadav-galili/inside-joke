// Metro bundles images and hands the import back as an asset id.
declare module '*.png' {
  const asset: number;
  export default asset;
}
