import { HttpException, HttpStatus } from '@nestjs/common';
import { FieldError } from '../validation/utils';

/** 输入非法异常：携带结构化字段错误，HTTP 400 */
export class ValidationException extends HttpException {
  constructor(errors: FieldError[], message = '输入参数非法') {
    super(
      {
        ok: false,
        error: 'VALIDATION_FAILED',
        message,
        errors,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
