from django.db import transaction
from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import Pit, User, Yard
from pits.rules import RuleError, assert_can_set_status, latest_ph

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


def pit_json(pit: Pit) -> dict:
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
    }


def yard_json(yard: Yard) -> dict:
    return {"id": yard.id, "name": yard.name, "village": yard.village}


def pick_yard(yard_id: int | None) -> Yard:
    qs = Yard.objects.order_by("id")
    yard = qs.filter(id=yard_id).first() if yard_id is not None else qs.first()
    if yard is None:
        raise HttpError(404, "鞣场不存在" if yard_id is not None else "尚无鞣场")
    return yard


@api.post("/auth/login")
def login(request, payload: LoginIn):
    user = User.objects.filter(username=payload.username).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "用户名或密码错误")
    return {"access_token": make_token(user.username), "user": {"username": user.username, "role": user.role}}


@api.get("/auth/me", auth=auth)
def me(request):
    user = request.auth
    return {"username": user.username, "role": user.role}


@api.get("/health")
def health(request):
    return {"status": "ok", "service": "TanPit"}


@api.get("/yards", auth=auth)
def yards(request):
    return [yard_json(y) for y in Yard.objects.order_by("id")]


@api.get("/board", auth=auth)
def board(request, yard_id: int | None = None):
    yard = pick_yard(yard_id)
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {
        "yard": yard.name,
        "village": yard.village,
        "yardId": yard.id,
        "pits": [pit_json(p) for p in pits],
    }


@api.get("/compare", auth=auth)
def compare(request, yard_id: int | None = None):
    """同行对照台：按行列出各坑最近酸碱、同行鞣制中均值、差值（只读）。"""
    yard = pick_yard(yard_id)
    pits = sorted(yard.pits.prefetch_related("samples"), key=lambda p: (p.row, p.col))
    ph_by_id = {p.id: latest_ph(p) for p in pits}
    rows = []
    for row_no in sorted({p.row for p in pits}):
        row_pits = [p for p in pits if p.row == row_no]
        tanning_phs = [
            ph_by_id[p.id]
            for p in row_pits
            if p.status == Pit.STATUS_TANNING and ph_by_id[p.id] is not None
        ]
        mean = round(sum(tanning_phs) / len(tanning_phs), 2) if tanning_phs else None
        rows.append(
            {
                "row": row_no,
                "peerMean": mean,
                "pits": [
                    {
                        "id": p.id,
                        "code": p.code,
                        "status": p.status,
                        "latestPh": ph_by_id[p.id],
                        "diff": None
                        if mean is None or ph_by_id[p.id] is None
                        else round(ph_by_id[p.id] - mean, 2),
                    }
                    for p in row_pits
                ],
            }
        )
    return {"yard": yard_json(yard), "rows": rows}


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    pit.samples.create(ph=payload.ph, operator=request.auth.username)
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    with transaction.atomic():
        base = Pit.objects.filter(id=pit_id).first()
        if base is None:
            raise HttpError(404, "坑不存在")
        # 同一行的坑按 id 顺序一并加行锁：两名工同时抢改同行坑时串行，
        # 后到者读到已提交的新状态，同一坑只可能有一笔变更入库。
        row_ids = list(
            Pit.objects.filter(yard_id=base.yard_id, row=base.row)
            .order_by("id")
            .values_list("id", flat=True)
        )
        locked = {pid: Pit.objects.select_for_update().get(id=pid) for pid in row_ids}
        pit = locked[pit_id]
        try:
            assert_can_set_status(pit, payload.status)
        except RuleError as exc:
            raise HttpError(400, str(exc))
        pit.status = payload.status
        pit.save(update_fields=["status"])
    return pit_json(pit)
