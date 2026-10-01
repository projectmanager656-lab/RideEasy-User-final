function withRequestId(req, payload) {
  if (req?.requestId) return { ...payload, requestId: req.requestId };
  return payload;
}

/**
 * Standard envelope (new): success, message, data — plus legacy flat spread and `ok`
 * so existing clients keep working.
 */
function ok(res, req, status, message, data = {}, options = {}) {
  const hasData =
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).length > 0;

  const includeFlatData = options.includeFlatData === true;

  return res.status(status).json(
    withRequestId(req, {
      success: true,
      ok: true,
      message,
      ...(hasData ? { data } : {}),
      ...(includeFlatData ? data : {}),
    }),
  );
}

function fail(res, req, status, message, data = {}) {
  const hasData =
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.keys(data).length > 0;
  const code = data?.code ?? `HTTP_${status}`;
  const merged = hasData ? { ...data } : {};
  delete merged.code;
  return res.status(status).json(
    withRequestId(req, {
      success: false,
      ok: false,
      error: message,
      message,
      code,
      ...(hasData ? { data: merged } : {}),
      ...merged,
    }),
  );
}

module.exports = {
  ok,
  fail,
};
