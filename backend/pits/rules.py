"""鞣坑状态门槛。

- 已放液：最近一次浸液酸碱度须在 3.5～5.0（只看这一条，不看同行均值）。
- 改鞣制中：同一行已有鞣制中坑时，取这些同行坑最近酸碱的算术平均，
  用本坑最近酸碱去减，绝对值大于 0.6 则挡住；本行没有鞣制中坑则不比。
"""

from pits.models import Pit

MIN_PH = 3.5
MAX_PH = 5.0
TANNING_MAX_DIFF = 0.6

STATUS_LABELS = {
    Pit.STATUS_FILL: "注液",
    Pit.STATUS_TANNING: "鞣制中",
    Pit.STATUS_DRAINED: "已放液",
}


class RuleError(ValueError):
    pass


def _fmt(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def latest_ph(pit: Pit) -> float | None:
    sample = pit.samples.order_by("-taken_at", "-id").first()
    return None if sample is None else sample.ph


def row_tanning_peer_mean(pit: Pit) -> float | None:
    """同一行处于鞣制中的坑（不含本坑）最近酸碱的算术平均；没有可比的坑则 None。"""
    peers = Pit.objects.filter(
        yard_id=pit.yard_id, row=pit.row, status=Pit.STATUS_TANNING
    ).exclude(id=pit.id)
    values = [ph for ph in (latest_ph(peer) for peer in peers) if ph is not None]
    if not values:
        return None
    return sum(values) / len(values)


def assert_can_set_status(pit: Pit, new_status: str) -> None:
    allowed = {Pit.STATUS_FILL, Pit.STATUS_TANNING, Pit.STATUS_DRAINED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")
    if new_status == pit.status:
        raise RuleError(f"该坑已是「{STATUS_LABELS[pit.status]}」，无需重复操作")
    if new_status == Pit.STATUS_TANNING:
        mean = row_tanning_peer_mean(pit)
        if mean is None:
            return  # 本行没有鞣制中坑，不作比对
        ph = latest_ph(pit)
        if ph is None:
            raise RuleError("该坑尚无浸液酸碱记录，不能与同行比对，不能改为鞣制中")
        diff = abs(ph - mean)
        if diff > TANNING_MAX_DIFF + 1e-9:
            raise RuleError(
                f"最近酸碱度 {_fmt(ph)} 与同行鞣制中均值 {_fmt(mean)} 的差值 "
                f"{_fmt(diff)} 超过 {_fmt(TANNING_MAX_DIFF)}，不能改为鞣制中"
            )
        return
    if new_status != Pit.STATUS_DRAINED:
        return
    ph = latest_ph(pit)
    if ph is None:
        raise RuleError("该坑尚无浸液酸碱记录，不能放液")
    if ph < MIN_PH or ph > MAX_PH:
        raise RuleError(f"最近酸碱度 {_fmt(ph)} 不在 {_fmt(MIN_PH)}～{_fmt(MAX_PH)}，不能放液")
