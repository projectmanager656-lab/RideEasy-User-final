const { ok } = require("../../utils/apiResponse");

function responseDouble() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe("success response envelope", () => {
  test("can keep data nested without adding duplicate root fields", () => {
    const res = responseDouble();
    const data = { token: "jwt", captain: { name: "Test Captain" } };

    ok(res, { requestId: "request-1" }, 201, "Captain registered", data, {
      includeFlatData: false,
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ok: true,
      message: "Captain registered",
      data,
      requestId: "request-1",
    });
  });

  test("keeps data nested by default", () => {
    const res = responseDouble();

    ok(res, {}, 200, "Success", { value: 1 });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ok: true,
      message: "Success",
      data: { value: 1 },
    });
  });

  test("can include legacy root-level data when explicitly requested", () => {
    const res = responseDouble();

    ok(res, {}, 200, "Success", { value: 1 }, { includeFlatData: true });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ok: true,
      message: "Success",
      data: { value: 1 },
      value: 1,
    });
  });
});
