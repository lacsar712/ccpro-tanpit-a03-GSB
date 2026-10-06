from pits.models import LiquorSample, Pit, User, Yard

# (场名, 村坊, [(坑码, 状态, 行, 列, 最近酸碱), ...])
LAYOUT: list[tuple[str, str, list[tuple]]] = [
    (
        "南冈鞣场",
        "青皮村",
        [
            # 东排：验收行。鞣制中 4.0；甲 4.5（差 0.5 可过）；乙 5.0（差 1.0 须挡）
            ("东-1", Pit.STATUS_TANNING, 0, 0, 4.0),
            ("东-甲", Pit.STATUS_FILL, 0, 1, 4.5),
            ("东-乙", Pit.STATUS_FILL, 0, 2, 5.0),
            # 中排：甲差恰为 0.6（不过线，可入鞣）；已放液只看 3.5～5.0
            ("中-1", Pit.STATUS_TANNING, 1, 0, 4.3),
            ("中-甲", Pit.STATUS_FILL, 1, 1, 4.9),
            ("中-乙", Pit.STATUS_DRAINED, 1, 2, 3.8),
            # 西排：尚无酸碱读数的新坑
            ("西-1", Pit.STATUS_FILL, 2, 0, None),
            ("西-甲", Pit.STATUS_DRAINED, 2, 1, 4.1),
        ],
    ),
    (
        "北冈鞣场",
        "黄泥铺",
        [
            ("北-1", Pit.STATUS_TANNING, 0, 0, 3.9),
            ("北-甲", Pit.STATUS_FILL, 0, 1, 4.1),
            ("北-乙", Pit.STATUS_FILL, 0, 2, 5.2),
        ],
    ),
]

# 验收标记坑位：缺任一即视为旧快照，整库演示数据重建（账号保留）。
MARKER_CODES = ("东-1", "东-甲", "东-乙")


def _ensure_users() -> None:
    admin, _ = User.objects.get_or_create(username="admin", defaults={"role": "admin"})
    admin.role = "admin"
    admin.set_password("123456")
    admin.save()
    worker, _ = User.objects.get_or_create(username="worker", defaults={"role": "worker"})
    worker.role = "worker"
    worker.set_password("123456")
    worker.save()


def _layout_matches() -> bool:
    yard = Yard.objects.filter(name="南冈鞣场").first()
    if yard is None:
        return False
    existing = set(yard.pits.values_list("code", flat=True))
    return all(code in existing for code in MARKER_CODES)


def seed_demo() -> None:
    _ensure_users()
    if _layout_matches():
        return
    # 旧快照（如 A03 初始数据）：清掉场次及其坑位、酸碱记录后重建。
    Yard.objects.all().delete()
    for yard_name, village, pits in LAYOUT:
        yard = Yard.objects.create(name=yard_name, village=village)
        for code, status, row, col, ph in pits:
            pit = Pit.objects.create(yard=yard, code=code, status=status, row=row, col=col)
            if ph is not None:
                LiquorSample.objects.create(pit=pit, ph=ph, operator="worker")
