# PUP

把矢量图形、骨架、关键帧和多个动作装进一个小文件。
支持 Canvas 与原生 SVG，PUP 播放器没有 WASM，也没有运行时包依赖。

[在线对照](https://henrywhuang.github.io/pup/) · [English](README.md)

[下载 PUP 动画](https://henrywhuang.github.io/pup/#downloads)：预览下方可以下载当前角色，
下载区提供七个动画的独立下载及 ZIP。小黄鸟使用 `.puc`，并提供骨骼映射下载；
ZIP 同时包含骨骼映射和浣熊舞蹈的 PUP1 兼容文件。答题文件包含答对、答错两个动作。

## 动画案例与真实对照

- **前两个案例：狐狸跳舞、浣熊跳舞**，原 WebP 在左、PUP 在右，发布文件逐字节保留。
- **第三个案例：小黄鸟转身**，左侧切换原始七个 SVG 视图，右侧播放转身；Canvas／SVG 均可显示原有 8 个骨骼。
- **WebP / PUP**：原始狐狸 WebP 与矢量重建，同步播放、逐帧、叠加和像素差异。
- **Rive / PUP**：同一角色原来的 Rive 身体／手部文件，比对 PUP 探头动作。
- **SVG / PUP**：浣熊换一套 SVG 造型，复用答对与答错的动作时间。

体积从真实文件计算，运行时和动画资源分别统计。Rive 的编辑器及运行时能力更完整；
PUP 专注于轻量角色动画，不把文件体积差异说成性能倍数。

## WebP ＋ SVG 就是制作的起点

WebP 提供动作和节奏，SVG 提供矢量造型。作者或 agent 分析部件、建立骨架与
关键帧，生成可编辑的 `rig.svg`、`motion.json`，再编译为 PUP。

```sh
npm ci
python3 -m pip install -r requirements.txt
node bin/pup.mjs prepare reference.webp artwork.svg work/
# 根据参考，编写 work/rig.svg 和 work/motion.json
node bin/pup.mjs import work/rig.svg work/motion.json work/animation.pup
```

准备命令会提取原始帧时间、无损帧图集和 SVG 部件 ID，不自动完成所有拆件、
绑定及表情形变。仓库提供[重建提示词](prompts/rebuild-pup.md)、完整骨架和动作文件，
能重新编译出与发布版逐字节一致的示例 PUP。

> **作者的实用结论：这套重建流程直接用 Astra＋max。只有这个配置稳定做成了；
> 其他模型在这里主要是在浪费时间。**
>
> 这是本项目的实践经验，不是跨模型基准测试。播放器和编译器本身不依赖模型。

## 运行和使用

需要 Node.js 22+、Python 和 Pillow：

```sh
npm ci
python3 -m pip install -r requirements.txt
npm run dev
npm test
npm run build
```

打开 `http://127.0.0.1:4320`。只有切到 Rive 对照时，才加载它的 JS/WASM。

```js
import { CanvasPlayer } from '@henrywhuang/pup';
const actor = await CanvasPlayer.load(canvas, 'fox.pup');
actor.play('correct');
actor.play('wrong');
actor.dispose();
```

也可以用 `createSvgRenderer` 输出原生 SVG，或把求解后的几何交给宿主渲染器。
狐狸舞蹈为 **87,035 B**，浣熊舞蹈为 **21,021 B**，小黄鸟 PUC 为 **68,136 B**。
狐狸双动作文件为 **12,669 B**，浣熊为 **14,563 B**。这些是示例实际体积，不是
对任意动画的保证。圆眼、嘴线和连续表情做过有意调整，不宣称逐像素等同于原 WebP。

身体保留原 SVG 轮廓；连接问题在手部曲线与层级上处理，不靠改大身体掩盖。

## 这次播放器改动

体积变化、依赖与验证记录见[本次更新报告](docs/dance-release.md)。

补齐 PUP2 矢量姿态库、无损 PUPZ 容器和小黄鸟 PUC1 的读取，Canvas／SVG 按需缓存
姿态路径。`loadPup()` 也能从原 `preview.html` 提取动画和骨骼数据，不执行里面的脚本。
骨骼覆盖层使用原来的节点和父子关系，随动作更新；没有骨骼映射的案例不会虚构骨骼。

**没有新增 npm 依赖，也没有新增 WASM。** PUC1 解压使用浏览器原生
`DecompressionStream('gzip')`；PUP1／PUP2／PUPZ 不依赖这个 API。
现有 Rive 依赖仅服务于 Rive 对照页，进入该页才加载。WebP 帧图集也只用于对照，
不打进播放器或 PUP 文件。具体 API 和兼容范围见 [API 文档](docs/api.md)。

代码采用 [MIT](LICENSE)，示例角色和参考动画见 [ASSETS.md](ASSETS.md)。
自己的产品应使用你拥有权利的素材。
