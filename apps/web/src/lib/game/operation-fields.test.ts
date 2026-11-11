import { expect, it } from "vite-plus/test";
import { formPayload, parsePayload } from "./operation-fields";
it("submits the selected slot entry, not the card category or slot ordinal", () => {
  expect(
    formPayload(
      [
        { name: "slot_entry", type: "uint32" },
        { name: "card_entry", type: "uint32" },
      ],
      { slot_entry: "102", card_entry: "201" },
    ),
  ).toEqual({ slot_entry: 102, card_entry: 201 });
});
it("preserves 64-bit identifiers and false, skips unspecified fields, rejects lossy nested numbers", () => {
  const fields = [
    { name: "player_id", type: "int64" },
    { name: "mode", type: "proto.Mode" },
    { name: "flag", type: "bool" },
    { name: "stats", type: "map<int32,int64>" },
  ];
  expect(
    formPayload(fields, { player_id: "9007199254740993", mode: "PLAY", flag: "false" }),
  ).toEqual({ player_id: "9007199254740993", mode: "PLAY", flag: false });
  expect(() => formPayload(fields, { stats: '{"a":9007199254740993}' })).toThrow();
  expect(() => parsePayload('{"id":1e500}')).toThrow();
});
