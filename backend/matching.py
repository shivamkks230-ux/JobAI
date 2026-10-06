"""Weighted job-candidate matching engine (0-100) with explainable reasons and gaps."""
import re

WEIGHTS = {"skills": 30, "experience": 20, "role": 15, "location": 10,
           "salary": 10, "education": 5, "work_mode": 5, "industry": 5}

EDU_LEVELS = [("phd", 6), ("doctor", 6), ("post", 5), ("master", 5), ("mba", 5), ("m.tech", 5), ("mca", 5),
              ("bachelor", 4), ("graduate", 4), ("b.tech", 4), ("b.e", 4), ("bca", 4), ("b.com", 4), ("bba", 4),
              ("b.sc", 4), ("ba", 4), ("diploma", 3), ("12", 2), ("hsc", 2), ("10", 1), ("ssc", 1)]
STOP = {"and", "the", "of", "a", "an", "for", "in", "to", "with", "senior", "junior", "executive", "associate", "lead", "sr", "jr"}


def _norm(s) -> str:
    return re.sub(r"\s+", " ", str(s or "").lower().strip())


def _tokens(*texts) -> set:
    out = set()
    for t in texts:
        if isinstance(t, list):
            t = " ".join(map(str, t))
        out |= {w for w in re.findall(r"[a-z0-9+#.]+", _norm(t)) if w not in STOP and len(w) > 1}
    return out


def _edu_level(text) -> int:
    t = _norm(text)
    if not t:
        return 0
    for key, lvl in EDU_LEVELS:
        if key in t:
            return lvl
    return 3


def _skill_has(cand_skills: list, skill: str) -> bool:
    s = _norm(skill)
    return any(s == c or (len(s) > 3 and (s in c or c in s)) for c in cand_skills if c)


def compute_match(profile: dict | None, job: dict) -> dict:
    if not profile:
        return {"score": None, "reasons": [], "gaps": [], "breakdown": {}}
    reasons, gaps, b = [], [], {}
    cand_skills = [_norm(s) for s in (profile.get("skills") or [])]

    # Skills (30)
    req = job.get("required_skills") or []
    pref = job.get("preferred_skills") or []
    matched = [s for s in req if _skill_has(cand_skills, s)]
    b["skills"] = (len(matched) / len(req)) if req else (0.6 if cand_skills else 0.3)
    if req and matched:
        reasons.append(f"Skills match ({len(matched)}/{len(req)} required)")
    for s in req:
        if s not in matched:
            gaps.append(f"{s} required")
    for s in pref:
        if not _skill_has(cand_skills, s):
            gaps.append(f"{s} preferred")

    # Experience (20)
    yrs = float(profile.get("experience_years") or 0)
    mn, mx = float(job.get("min_experience") or 0), job.get("max_experience")
    mx = float(mx) if mx not in (None, "") else None
    if yrs >= mn and (mx is None or yrs <= mx + 1):
        b["experience"] = 1.0
        reasons.append("Experience matches")
    elif yrs < mn:
        b["experience"] = max(0.0, 1 - (mn - yrs) / max(mn, 1))
        gaps.append(f"Needs {mn:g}+ years experience")
    else:
        b["experience"] = 0.7

    # Role relevance (15)
    job_t = _tokens(job.get("title"), job.get("category"))
    cand_t = _tokens(profile.get("preferred_roles") or [], profile.get("headline"), profile.get("job_titles") or [])
    b["role"] = min(1.0, len(job_t & cand_t) / max(1, min(len(job_t), 3))) if cand_t else 0.3
    if b["role"] >= 0.6:
        reasons.append("Role aligns with your preferences")

    # Location (10)
    mode = job.get("work_mode")
    locs = [_norm(l) for l in (profile.get("preferred_locations") or []) + [profile.get("current_location")] if l]
    jloc = _norm(job.get("location"))
    if mode == "remote":
        b["location"] = 1.0
        reasons.append("Remote role — location flexible")
    elif jloc and any(l and (l in jloc or jloc in l) for l in locs):
        b["location"] = 1.0
        reasons.append("Location matches")
    elif "anywhere" in locs or profile.get("open_to_relocate"):
        b["location"] = 0.7
    else:
        b["location"] = 0.2 if locs else 0.5
        if locs:
            gaps.append(f"Located in {job.get('location')}")

    # Salary (10)
    exp_sal = profile.get("expected_salary")
    smax = job.get("salary_max")
    if smax and job.get("salary_period") == "monthly":
        smax = float(smax) * 12
    if not exp_sal or not smax:
        b["salary"] = 0.7
    elif float(exp_sal) <= float(smax):
        b["salary"] = 1.0
        reasons.append("Salary matches expectation")
    else:
        b["salary"] = max(0.0, float(smax) / float(exp_sal))
        gaps.append("Salary below your expectation")

    # Education (5)
    need = _edu_level(job.get("education"))
    have = max([_edu_level(e.get("degree") if isinstance(e, dict) else e) for e in (profile.get("education") or [])] or [0])
    b["education"] = 1.0 if need == 0 or have >= need else (0.5 if have else 0.3)
    if need and have < need:
        gaps.append(f"Education: {job.get('education')}")

    # Work preference (5)
    wp = profile.get("work_preferences") or []
    b["work_mode"] = 1.0 if (not wp or mode in wp) else 0.3
    if wp and mode in wp:
        reasons.append(f"{(mode or '').title()} work preference matches")

    # Industry (5)
    inds = [_norm(i) for i in (profile.get("preferred_industries") or [])]
    jind = _norm(job.get("industry"))
    b["industry"] = 1.0 if (not inds or jind in inds) else 0.4

    score = round(sum(WEIGHTS[k] * v for k, v in b.items()))
    return {"score": max(0, min(100, score)), "reasons": reasons[:5], "gaps": gaps[:5],
            "breakdown": {k: round(v * WEIGHTS[k]) for k, v in b.items()}}
