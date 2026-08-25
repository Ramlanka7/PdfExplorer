namespace Server.Infrastructure;

public sealed record ErrorBody(string Code, string Message, string CorrelationId);

public sealed record ErrorEnvelope(ErrorBody Error);
