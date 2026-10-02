function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: result.error.issues,
        },
      });
    }

    req.body = result.data;
    next();
  };
}

module.exports = validate;