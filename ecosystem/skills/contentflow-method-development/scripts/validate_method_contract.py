#!/usr/bin/env python3
"""Validate a ContentFlow Method and its explicit block connections.

Usage: python validate_method_contract.py method.contentflow-method.json
Exit code 0 means no errors. Warnings are printed but do not fail the run.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PROCESSES = ["theme", "title", "thumbnail", "script", "narration", "assets", "editing", "publishing"]
BLOCK_TYPES = {"BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"}
OPERATORS = {"IA", "Humano", "Código"}
FIELD_TYPES = {"text", "number", "select", "boolean", "textarea", "multiselect", "list", "records", "datetime", "url", "file", "image", "audio", "video", "files", "approval", "thumbnail_layout"}
PARAM_TYPES = {"text", "number", "select", "boolean", "textarea"}
RECORD_TYPES = {"text", "textarea", "number", "boolean", "select", "datetime", "url", "file", "image", "audio", "video"}
COLLECTION_TYPES = {"list", "records", "files", "multiselect"}
SINGULAR_TYPES = FIELD_TYPES - COLLECTION_TYPES
PROMOTIONS = {("text", "textarea")}
MEDIA = {"file", "image", "audio", "video"}


def fail(errors, message):
    errors.append(message)


def get_fields(block, key):
    fields = block.get(key, [])
    return fields if isinstance(fields, list) else []


def field_schema(field):
    return {
        "type": field.get("type"),
        "keys": {x.get("key") for x in field.get("recordFields", []) if isinstance(x, dict)},
        "required_keys": {x.get("key") for x in field.get("recordFields", []) if isinstance(x, dict) and x.get("required")},
        "options": set(field.get("options", []) or []),
        "mime": set(field.get("presentation", {}).get("acceptedMimeTypes", []) or []) if isinstance(field.get("presentation"), dict) else set(),
    }


def compatible(source, target):
    st, tt = source["type"], target["type"]
    if st == tt:
        if st == "records":
            if not target["required_keys"].issubset(source["keys"]):
                return False, "recordFields obrigatórios do input não existem no output"
            for key in target["required_keys"]:
                pass
        if st in {"select", "multiselect"} and target["options"] and not target["options"].issubset(source["options"]):
            return False, "options obrigatórias do input não estão garantidas pelo output"
        return True, ""
    if (st, tt) in PROMOTIONS:
        return True, "promoção text→textarea"
    if st == "file" and tt in MEDIA:
        return False, "file genérico não garante mídia especializada"
    return False, f"tipo {st!r} não é compatível com {tt!r}"


def main(path: str) -> int:
    errors, warnings = [], []
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: não foi possível ler JSON: {exc}")
        return 2

    if data.get("format") != "contentflow-method":
        fail(errors, "format deve ser contentflow-method")
    if data.get("version") != 1:
        fail(errors, "version deve ser 1")
    method = data.get("method")
    if not isinstance(method, dict):
        fail(errors, "method deve ser objeto")
        return report(errors, warnings)
    process = method.get("processType")
    if process not in PROCESSES:
        fail(errors, f"processType inválido: {process!r}")
    blocks = method.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        fail(errors, "method.blocks deve ser uma lista não vazia")
        return report(errors, warnings)
    if len(blocks) > 200:
        fail(errors, "method.blocks não pode exceder 200 blocos")

    by_id = {}
    outputs = {}
    for index, block in enumerate(blocks):
        bid = block.get("id")
        if not isinstance(bid, str) or not bid:
            fail(errors, f"bloco {index}: id ausente")
            continue
        if bid in by_id:
            fail(errors, f"bloco {bid}: id duplicado")
        by_id[bid] = block
        if block.get("type") not in BLOCK_TYPES:
            fail(errors, f"bloco {bid}: type inválido")
        if block.get("operator") not in OPERATORS:
            fail(errors, f"bloco {bid}: operator inválido")
        if block.get("order") != index:
            fail(errors, f"bloco {bid}: order deve ser {index}")
        if "parameters" not in block or not isinstance(block.get("parameters"), list):
            fail(errors, f"bloco {bid}: parameters deve existir e ser lista")
        for p in block.get("parameters", []):
            if p.get("type") not in PARAM_TYPES:
                fail(errors, f"bloco {bid}: parâmetro {p.get('key')} tem tipo inválido")
            if p.get("type") != "select" and p.get("options"):
                fail(errors, f"bloco {bid}: options só pode ser usado em parâmetro select")
        seen_keys = set()
        for out in get_fields(block, "outputs"):
            key = out.get("key")
            if not key:
                fail(errors, f"bloco {bid}: output sem key")
            if key in seen_keys:
                fail(errors, f"bloco {bid}: output key duplicada {key}")
            seen_keys.add(key)
            if out.get("type") not in FIELD_TYPES:
                fail(errors, f"bloco {bid}: output {key} tem tipo inválido")
            if out.get("type") == "records":
                rkeys = [x.get("key") for x in out.get("recordFields", []) if isinstance(x, dict)]
                if not rkeys or len(rkeys) != len(set(rkeys)) or any(not x for x in rkeys):
                    fail(errors, f"bloco {bid}: recordFields inválidos em {key}")
            outputs[(bid, key)] = (out, index)
        if block.get("type") == "ESCOLHER" and not block.get("collectionId"):
            warnings.append(f"bloco {bid}: ESCOLHER exige collectionId após importação no Canal")

    for index, block in enumerate(blocks):
        bid = block.get("id", f"index-{index}")
        for inp in get_fields(block, "inputs"):
            itype = inp.get("type")
            if itype not in FIELD_TYPES:
                fail(errors, f"bloco {bid}: input {inp.get('id')} tem tipo inválido")
            source = inp.get("source")
            if source == "previous_block":
                source_id, source_key = inp.get("blockId"), inp.get("sourceKey")
                if not source_id or (source_id, source_key) not in outputs:
                    fail(errors, f"bloco {bid}: input {inp.get('id')} referencia output inexistente")
                    continue
                source_field, source_index = outputs[(source_id, source_key)]
                if source_index >= index:
                    fail(errors, f"bloco {bid}: input referencia bloco não anterior: {source_id}")
                ok, reason = compatible(field_schema(source_field), field_schema(inp))
                if not ok:
                    fail(errors, f"conflito {source_id}.{source_key} ({source_field.get('type')}) → {bid}.{inp.get('id')} ({itype}): {reason}")
            elif source == "previous_process":
                if not inp.get("sourceProcessType") or not inp.get("sourceKey"):
                    fail(errors, f"bloco {bid}: previous_process exige sourceProcessType e sourceKey")
            elif source == "project":
                if inp.get("sourceKey") not in {"title", "deadline"}:
                    fail(errors, f"bloco {bid}: project só aceita title ou deadline")
            elif source == "static":
                if "staticValue" not in inp:
                    fail(errors, f"bloco {bid}: static exige staticValue")
            elif source == "channel_library":
                warnings.append(f"bloco {bid}: channel_library não é portátil")
            else:
                fail(errors, f"bloco {bid}: source inválido ou ausente")

        if block.get("type") == "VALIDAR":
            validation = block.get("validation") or {}
            target_id = validation.get("targetBlockId")
            target_key = validation.get("targetOutputKey")
            mode = validation.get("mode")
            if mode not in {"approval", "select_one", "select_many"}:
                fail(errors, f"bloco {bid}: validation.mode inválido")
            if target_id not in by_id:
                fail(errors, f"bloco {bid}: targetBlockId inexistente")
            elif by_id[target_id].get("order", index) >= index or by_id[target_id].get("type") == "VALIDAR":
                fail(errors, f"bloco {bid}: validação deve apontar para bloco anterior não-VALIDAR")
            if mode != "approval" and (target_id, target_key) not in outputs:
                fail(errors, f"bloco {bid}: targetOutputKey inexistente")

    return report(errors, warnings)


def report(errors, warnings):
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    print(f"Resumo: {len(errors)} erro(s), {len(warnings)} aviso(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python validate_method_contract.py arquivo.contentflow-method.json")
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1]))
