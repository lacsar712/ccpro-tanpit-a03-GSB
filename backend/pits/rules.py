"""鞣坑状态变更规则。

- 已放液：最近一次浸液酸碱度须在 3.5～5.0，只看本坑，与同行均值无关。
- 鞣制中：同一行已有鞣制中坑时，本坑最近酸碱度与同行鞣制中坑最近
  酸碱度的算术平均之差，绝对值不得大于 0.6；本行没有鞣制中则不比。
"""

from __future__ import annotations

from pits.models import Pit

MIN_PH = 3.5
MAX_PH = 5.0
TAN_PEER_MAX_DIFF = 0.6
# 浮点容差：4.9 - 4.3 这类“恰为 0.6”不得被二进制尾数误判成超限。
_DIFF_EPS = 1e-9


class RuleError(ValueError):
    pass


def diff_over_limit(diff: float) -> bool:
    """差值是否严格大于 0.6（恰好 0.6 不过线）。规则与对照台共用。"""
    return diff > TAN_PEER_MAX_DIFF + _DIFF_EPS


def latest_ph(pit: Pit) -> float | None:
    # LiquorSample 的 Meta ordering 为 -taken_at, -id；
    # 外层 prefetch_related("samples") 时这里直接命中缓存，不另发 SQL。
    for sample in pit.samples.all():
        return sample.ph
    return None


def row_peer_pits(pit: Pit) -> list[Pit]:
    """同一场、同一行、排除本坑的其他坑。"""
    return list(
        Pit.objects.filter(yard_id=pit.yard_id, row=pit.row)
        .exclude(id=pit.id)
        .prefetch_related("samples")
    )


def peer_tanning_mean(pit: Pit, row_pits: list[Pit] | None = None) -> float | None:
    """本行鞣制中坑（排除本坑）最近酸碱度的算术平均；无可用读数返回 None。"""
    if row_pits is None:
        row_pits = row_peer_pits(pit)
    values = [
        ph
        for other in row_pits
        if other.id != pit.id
        if other.status == Pit.STATUS_TANNING
        if (ph := latest_ph(other)) is not None
    ]
    if not values:
        return None
    return sum(values) / len(values)


def assert_can_set_status(
    pit: Pit, new_status: str, row_pits: list[Pit] | None = None
) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")

    # 放液门槛始终只看本坑 3.5～5.0，同行均值差不得用于拦截放液。
    if new_status == Pit.STATUS_DRAINED:
        ph = latest_ph(pit)
        if ph is None:
            raise RuleError("该坑尚无浸液酸碱记录，不能放液")
        if ph < MIN_PH or ph > MAX_PH:
            raise RuleError(f"最近酸碱度 {ph:g} 不在 {MIN_PH:g}～{MAX_PH:g}，不能放液")
        return

    if new_status == Pit.STATUS_TANNING:
        mean = peer_tanning_mean(pit, row_pits)
        # 本行没有鞣制中坑（或同行全无酸碱读数）则不比较。
        if mean is None:
            return
        ph = latest_ph(pit)
        if ph is None:
            raise RuleError("该坑尚无浸液酸碱记录，不能改为鞣制中")
        diff = abs(ph - mean)
        if diff_over_limit(diff):
            raise RuleError(
                f"本行鞣制中坑最近酸碱均值为 {mean:.2f}，本坑为 {ph:g}，"
                f"差值 {diff:.2f} 已超过 {TAN_PEER_MAX_DIFF:g}，不能改为鞣制中"
            )
