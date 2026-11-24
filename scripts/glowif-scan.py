"""AI-Hub ZIP의 쇼핑몰 스킨케어 부정 라벨을 분석하고 집계만 내보내요."""

import hashlib
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile


def scan(file_path, topics):
    rules = {
        topic["id"]: (set(topic["aspects"]), re.compile(topic["pattern"]))
        for topic in topics
    }
    hits = {topic_id: set() for topic_id in rules}
    titles = {topic_id: set() for topic_id in rules}
    seen_ids = set()
    seen_text = set()
    dates = []
    with ZipFile(file_path, metadata_encoding="cp949") as archive:
        for entry in archive.infolist():
            name = entry.filename
            if "/쇼핑몰/" not in name or "스킨케어" not in name or not name.endswith(".json"):
                continue
            for row in json.loads(archive.read(entry)):
                if (row["Source"], row["Domain"], row["MainCategory"]) != ("쇼핑몰", "화장품", "스킨케어"):
                    continue
                review_id = row["Index"]
                title = row["ProductName"].strip()
                body = " ".join(row["RawText"].split())
                digest = hashlib.sha256(f"{title}\0{body}".encode()).digest()
                if review_id in seen_ids or digest in seen_text:
                    continue
                seen_ids.add(review_id)
                seen_text.add(digest)
                if re.fullmatch(r"\d{8}", str(row.get("RDate", ""))):
                    dates.append(str(row["RDate"]))
                for aspect in row["Aspects"]:
                    if aspect["SentimentPolarity"] != "-1":
                        continue
                    for topic_id, (aspects, pattern) in rules.items():
                        if aspect["Aspect"] in aspects and pattern.search(aspect["SentimentText"]):
                            hits[topic_id].add(review_id)
                            if title:
                                titles[topic_id].add(title)
    if not seen_ids:
        raise ValueError("리뷰 없음")
    return {
        "source": "aihub-71603",
        "reviews": len(seen_ids),
        "from": min(dates, default=None),
        "to": max(dates, default=None),
        "topics": [
            {"id": topic_id, "reviews": len(hits[topic_id]), "products": len(titles[topic_id])}
            for topic_id in rules
        ],
    }


if __name__ == "__main__":
    try:
        topic_file = Path(__file__).resolve().parent.parent / "config" / "glowif.json"
        catalog = json.loads(topic_file.read_text(encoding="utf-8"))["topics"]
        print(json.dumps(scan(sys.argv[1], catalog), ensure_ascii=False))
    except Exception:
        # ZIP 내용·파일 이름·리뷰 원문은 로그에 남기지 않아요.
        sys.exit("AI-Hub 쇼핑몰 스킨케어 라벨링 ZIP을 읽지 못했어요. 파일과 Python 3.11 이상을 확인해 주세요.")
