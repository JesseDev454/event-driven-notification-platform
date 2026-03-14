import { ValidationError } from '../types/app-error';

export interface CursorPaginationInput {
  limit: number;
  cursor?: string;
}

export interface CursorPaginationResult {
  offset: number;
  take: number;
}

export interface PaginatedCollectionResult<T> {
  items: T[];
  nextCursor: string | null;
}

const encodeOffsetCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');

const decodeOffsetCursor = (cursor: string): number => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as { offset?: unknown };

    if (
      typeof decoded.offset !== 'number' ||
      !Number.isInteger(decoded.offset) ||
      decoded.offset < 0
    ) {
      throw new Error('Invalid offset');
    }

    return decoded.offset;
  } catch (_error) {
    throw new ValidationError('Cursor must be a valid pagination token', 'invalid_cursor');
  }
};

export const resolveCursorPagination = ({
  limit,
  cursor
}: CursorPaginationInput): CursorPaginationResult => {
  const offset = cursor ? decodeOffsetCursor(cursor) : 0;

  return {
    offset,
    take: limit + 1
  };
};

export const finalizeCursorPagination = <T>(
  items: T[],
  limit: number,
  offset: number
): PaginatedCollectionResult<T> => {
  const hasMore = items.length > limit;
  const slicedItems = hasMore ? items.slice(0, limit) : items;

  return {
    items: slicedItems,
    nextCursor: hasMore ? encodeOffsetCursor(offset + slicedItems.length) : null
  };
};
