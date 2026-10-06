from pits.models import LiquorSample, Pit, User, Yard


def seed_demo() -> None:
    admin, _ = User.objects.get_or_create(username="admin", defaults={"role": "admin"})
    admin.role = "admin"
    admin.set_password("123456")
    admin.save()
    worker, _ = User.objects.get_or_create(username="worker", defaults={"role": "worker"})
    worker.role = "worker"
    worker.set_password("123456")
    worker.save()
    if Yard.objects.exists():
        return
    yard = Yard.objects.create(name="南冈鞣场", village="青皮村")
    # 东排一行：鞣制中 4.0，注液甲 4.5（差 0.5 可过），注液乙 5.0（差 1.0 应挡）
    layout = [
        ("东-1", Pit.STATUS_TANNING, 0, 0, 4.0),
        ("东-2", Pit.STATUS_FILL, 0, 1, 4.5),
        ("东-3", Pit.STATUS_FILL, 0, 2, 5.0),
        ("中-1", Pit.STATUS_DRAINED, 1, 0, 4.6),
        ("中-2", Pit.STATUS_TANNING, 1, 1, 6.1),
        ("西-1", Pit.STATUS_FILL, 2, 0, None),
        ("西-2", Pit.STATUS_DRAINED, 2, 1, 3.8),
    ]
    for code, status, row, col, ph in layout:
        pit = Pit.objects.create(yard=yard, code=code, status=status, row=row, col=col)
        if ph is not None:
            LiquorSample.objects.create(pit=pit, ph=ph, operator="worker")
    north = Yard.objects.create(name="北坡鞣场", village="北坡村")
    north_layout = [
        ("北-1", Pit.STATUS_FILL, 0, 0, 4.4),
        ("北-2", Pit.STATUS_TANNING, 0, 1, 4.8),
        ("北-3", Pit.STATUS_FILL, 0, 2, None),
    ]
    for code, status, row, col, ph in north_layout:
        pit = Pit.objects.create(yard=north, code=code, status=status, row=row, col=col)
        if ph is not None:
            LiquorSample.objects.create(pit=pit, ph=ph, operator="worker")
