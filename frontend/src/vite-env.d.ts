// Type declarations for Vite-specific import suffixes.

declare module "*.css?raw" {
  const content: string;
  export default content;
}
