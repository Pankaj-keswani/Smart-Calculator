export const Platform = { OS: 'web', Version: 0, select: (o: Record<string, unknown>) => o.web ?? o.default };
