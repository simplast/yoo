// Vite 资源导入类型声明
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
