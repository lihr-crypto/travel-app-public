# GitHub 修改流程

本项目仓库为 <https://github.com/lihr-crypto/travel-app-public>。后续修改使用功能分支和 Pull Request，默认分支为 `main`。

```sh
git switch main
git pull --ff-only
git switch -c feature/short-description
# 修改并运行对应检查
git add <本次修改的文件>
git commit -m "Describe the change"
git push -u origin HEAD
gh pr create --base main
```

本项目检查入口：`npm run check`。

首次克隆后运行 `git config core.hooksPath .githooks`。本地钩子阻止直接更新已有 `main`，GitHub 页面上的 PR 合并不受影响。钩子属于本机保护，不能替代服务器分支规则。

配置密钥、数据库、账单、账号记录、截图和诊断日志保留在本机忽略目录。配置使用仓库内模板，第三方代码沿用原有许可。PR 描述记录检查结果；只有用户授权的发布、数据库操作和对外发送才执行。
