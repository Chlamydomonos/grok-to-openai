# Grok反代

适用于grok.com的反代

使用方式：
- `pnpm install`安装依赖（没有pnpm的话npm应该也行）
- `npm run build`或`pnpm build`生成`config.yml`
- 修改`config.yml`
- 获取cookie并放入`cookies`文件夹
- `npm start`或`pnpm start`启动
- 启动后支持继续在`cookies`文件夹中添加或删除cookie，会自动识别

调用方式：
- 使用cookie文件名（不加`.txt`后缀）为key调用则会使用对应文件中的cookie
- 不带任何key（或使用`cookies`文件夹中不存在的文件名为key）则随机选择一个cookie
- 模型不管选什么都会调用grok-3