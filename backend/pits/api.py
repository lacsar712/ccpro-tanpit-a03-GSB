from django.db import transaction
from ninja import NinjaAPI, Query, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import Pit, User, Yard
from pits.rules import (
    MAX_PH,
    MIN_PH,
    TAN_PEER_MAX_DIFF,
    RuleError,
    assert_can_set_status,
    diff_over_limit,
    latest_ph,
    peer_tanning_mean,
)

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class YardFilter(Schema):
    yard_id: int | None = None


def yard_json(yard: Yard) -> dict:
    return {"id": yard.id, "name": yard.name, "village": yard.village}


def pit_json(pit: Pit) -> dict:
    return {
        "id": pit.id,
        "yardId": pit.yard_id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
    }


def get_yard(yard_id: int | None) -> Yard:
    if yard_id is not None:
        yard = Yard.objects.filter(id=yard_id).prefetch_related("pits__samples").first()
        if yard is None:
            raise HttpError(404, "鞣场不存在")
        return yard
    yard = Yard.objects.prefetch_related("pits__samples").order_by("id").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
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
    return {"yards": [yard_json(y) for y in Yard.objects.all().order_by("id")]}


@api.get("/board", auth=auth)
def board(request, filters: YardFilter = Query(...)):
    yard = get_yard(filters.yard_id)
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {
        "yard": yard_json(yard),
        "yards": [yard_json(y) for y in Yard.objects.all().order_by("id")],
        "pits": [pit_json(p) for p in pits],
    }


@api.get("/compare", auth=auth)
def compare(request, filters: YardFilter = Query(...)):
    """同行对照台（只读）：按场筛、按行列出最近酸碱、同行鞣制中均值、差值。"""
    yard = get_yard(filters.yard_id)
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    by_row: dict[int, list[Pit]] = {}
    for pit in pits:
        by_row.setdefault(pit.row, []).append(pit)

    rows = []
    for row_index in sorted(by_row):
        row_pits = by_row[row_index]
        items = []
        for pit in row_pits:
            ph = latest_ph(pit)
            # 与入鞣规则同口径：排除本坑的同行鞣制中坑最近读数算术平均。
            mean = peer_tanning_mean(pit, row_pits)
            diff = None if (ph is None or mean is None) else abs(ph - mean)
            items.append(
                {
                    **pit_json(pit),
                    "peerMean": mean,
                    "diff": diff,
                    "overLimit": diff is not None and diff_over_limit(diff),
                }
            )
        rows.append({"row": row_index, "pits": items})

    return {
        "yard": yard_json(yard),
        "yards": [yard_json(y) for y in Yard.objects.all().order_by("id")],
        "rows": rows,
        "tanPeerLimit": TAN_PEER_MAX_DIFF,
        "drainedRange": [MIN_PH, MAX_PH],
    }


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
    # 同一行的并发改态串行化：先定位坑所在行，再按 id 升序一次性锁住整行
    #（统一加锁顺序，跨行不会互锁）→ 用锁内读到的最新状态校验并写入。
    # 两名工同时把同一口注液坑拨成鞣制中时只可能有一笔成功，
    # 后到的一笔等到锁释放后看到状态已是 tanning，收到 409。
    with transaction.atomic():
        loc = Pit.objects.filter(id=pit_id).values("yard_id", "row").first()
        if loc is None:
            raise HttpError(404, "坑不存在")
        row_pits = list(
            Pit.objects.select_for_update()
            .prefetch_related("samples")
            .filter(yard_id=loc["yard_id"], row=loc["row"])
            .order_by("id")
        )
        pit = next(p for p in row_pits if p.id == pit_id)

        if pit.status == payload.status:
            raise HttpError(409, "该坑已是此状态，可能已有工友抢先登记，请刷新场地图")

        try:
            assert_can_set_status(pit, payload.status, row_pits)
        except RuleError as exc:
            raise HttpError(400, str(exc))
        pit.status = payload.status
        pit.save(update_fields=["status"])

    pit = Pit.objects.prefetch_related("samples").get(id=pit_id)
    return pit_json(pit)
