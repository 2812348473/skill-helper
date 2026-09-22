# skill-helper 设计

用户已确认：独立开源 AGH 插件，支持本地/GitHub/链接/压缩包导入，创建复用 skill-creator。

比较：插件直接操作 ~/.agh vs 复用 ToolContext.skillInstall。选择后者，来源处理留在插件；安装授权、信任、启用由宿主负责，不带管理员凭据。

公开工具：skill_helper_import（准备导入）、skill_helper_install（commit/status/cancel）、skill_helper_creator（读取官方 skill-creator 指导）、skill_helper_create（保存模型按指导生成的文件并准备安装）。eager 注册，普通 agnes.plugins，无内置白名单和生产依赖。

来源适配器独立可替换：本地目录原样交给宿主；GitHub 解析为固定 commit，通过公开内容 API 遍历指定目录；多个 Skill 返回候选，不私自全装；HTTPS Markdown/JSON 文件清单走宿主 fetchPublic；本地 ZIP 解包前检查路径/条目/膨胀大小/CRC，不执行压缩包内容。不支持私有登录页、任意网页抓取、未实现的压缩格式，明确报错。通用远程二进制 ZIP 缺少宿主安全公开二进制获取接口，先要求下载到本地，不能用裸 fetch 绕过 SSRF 防护。

网络只走宿主 fetchPublic，拒绝截断数据与非成功状态。磁盘只走宿主 fs；下载/生成暂存到当前工作区 .skill-helper/<UUID>/<name>，先全部校验再写，失败不自动删除用户目录。元数据名 ASCII，64 文件/128 项/深度4/单文件1MiB/总8MiB；正文256KiB；ZIP输入16MiB，拒绝链接、重复及大小写冲突。宿主为最终格式裁决者。

创建由会话模型读取上游 skill-creator，再生成 files 交给 create；插件不冒充另一个模型、不自动执行上游 Python/Claude CLI，不复制未核验许可证的第三方内容。保存与安装分开，prepare不等于ready；安装工具返回 running 后结束当前调用，后续查询，下一轮Skill快照才生效。

兼容：Node >=24、含 skillInstall 请求端口的 AGH 普通插件行；无端口报明确错误，无shell回退。当前核心仅Windows支持新目录安装，其他平台可准备但不承诺完成安装。旧部署需先更新核心。当前API没有Skill搜索管理端口，加载已有Skill沿用AGH的skill_list/skill_read，不重复接管运行时。

验证：node:test覆盖来源识别、受控API、拒绝权限、ZIP攻击输入、同名覆盖、来源变化/多Skill、创建和安装状态。用AGH真实checkToolDef/TypeBox Value验证schema与工具注册，进行临时目录核心安装集成。真实模型/网页/多平台验收单独记录，不把模拟通过当生产完成。
