# FE-002 环件 Demo 资料依据

2026-10-17 根据维护者指定的 `圆环_Golden-B7_已验证_20261010.mcam` 进行只读核对。该文件不是可直接读取的文本程序；未启动 Mastercam、未修改或重新后处理工程。

## 文件对应关系

指定 MCAM 为 706772 字节，SHA-256 为 `e1f8db1deb09404346be0a83d12f95de662fdcf596479c8c98fe9a1ee23f800e`，与本地 `CAPPtron-ApiTest/experiments/lathe_level4_verify/cutoff_ab/Golden-B7/baseline.mcam` 及其 `manifest.json` 完全一致。

同一冻结目录中的 `baseline.nc` 为 1752 字节，SHA-256 实测为 `9930cd6114a6b175c372aa1d797d615df7daca0a9a765b812e25fe60c090a57e`，与 manifest 一致。指定目录旁的旧 `环三d.NC` 不是这份 B7 输出，未拿它替代当前基线。

交叉核对材料均位于本地 CAPPtron-ApiTest：

- `experiments/lathe_level4_verify/cutoff_ab/Golden-B7/manifest.json`、`baseline.nc`、`cutoff-parameters.json`。
- `experiments/lathe_3d_profile/logs/03-baseline-ops.json` 与 `LATHE_3D_PROFILE_VALIDATION_REPORT.md`：原六工序的顺序、刀具和类型；B7 manifest 记录前五道 NC 保持不变。
- `experiments/lathe_level4_verify/LEVEL4_VERIFY_REPORT.md`：初始毛坯外径 43、内径 38、长度 100 mm。
- `LEVEL4_SEMIAUTO_WORKFLOW.md`：B7 修正范围、证据与限制。

不向前端仓库复制 MCAM、NC、STL、私人目录或视频，仅记录核查摘要和类型化 Demo Fixture。

## 页面数据映射

`src/api/mock/ringPlan.ts` 按实际保存顺序展示：端面车削 → 外圆粗车 → 外圆精车 → 内孔粗车 → 内孔精车 → 切断。没有球面加工、热处理或固定“08 精车外”。工步是各工序与 NC 动作的展示摘要，不声称原工程存在同样的业务工步树。

成品参考外径 41、内径 39、轴向厚度 5 mm。前三道使用 T0101 / VNMG 16 04 08，内孔两道使用 T0202 / CCMT 09 T3 04，切断使用 T0404 / N151.2-185-20-5G。界面不虚构机床编号。

基线 NC 在 G21、G96、G99 模态下记录恒线速 295 / 330 / 115 m/min、每转进给 0.3 / 0.1 / 0.1 mm/r，G50 转速上限 3600 r/min。恒线速没有误写为固定主轴转速。所有值是离线基线参考，不是本次 Agent 推荐值。

切断动作摘要为预切 X39.5 → 退刀 → 倒角 → 最终 X37.9，X 为该基线 NC 的直径坐标。未通过前端编辑生成或回写刀路。

## 人工补充信息的归属

已知的设计尺寸和程序参数直接显示，不要求用户凭空再填。未知的现场信息分两类：

- 任务共用：实际毛坯外径、预孔直径、长度、工件零点/偏置核对、装夹方式与伸出量。它们不属于“外圆精车独有参数”，在任一工序的现场信息视图可填写，整项任务共享一份草稿。
- 切断工序专用：实际切断刀具与刀柄装配核对。基线的已建模装配不证明当前现场装配相同，只在“06 切断”展示。

这六项是根据记录中尚未覆盖的现场条件设置的 **Demo 填写门槛**，不是从 MCAM 自动解析出的必填表，也不是经工艺专家批准的正式制造必填清单。字段附有要求补充的理由。全部填写且数值格式有效后，只启用演示入口；不等同于现场确认或工艺审批。

## 验证边界

历史 B7 记录报告限定建模范围内无碰撞、成品尺寸及分离状态通过；本次只核对文件哈希和保存记录，没有重跑 CAM 或物理加工验证。

原记录明确保留前端 +0.1 mm，成品轴向约 [-4.9, +0.1]，未与设计绝对范围 [-5, 0] 对齐；没有完整卡盘/夹具证明，STL 顶点极值不等于全表面拟合或实机验证。界面不会将该历史结果标记为当前任务已仿真通过。
