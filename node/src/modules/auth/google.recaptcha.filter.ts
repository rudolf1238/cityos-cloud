import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { GoogleRecaptchaException } from '@nestlab/google-recaptcha';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';

@Catch(GoogleRecaptchaException)
export class GoogleRecaptchaFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoogleRecaptchaFilter.name);

  catch(exception: GoogleRecaptchaException, _host: ArgumentsHost): any {
    this.logger.warn(exception);
    switch (exception.errorCodes[0]) {
      case 'timeout-or-duplicate': {
        throw new ApolloError(
          exception.getResponse().toString(),
          ErrorCode.RECAPTCHA_TIMEOUT_OR_DUPLICATE,
        );
      }
      case 'invalid-input-response': {
        throw new ApolloError(
          exception.getResponse().toString(),
          ErrorCode.RECAPTCHA_INVALID_INPUT_RESPONSE,
        );
      }
      default: {
        throw new ApolloError(
          exception.getResponse().toString(),
          ErrorCode.RECAPTCHA_UNKNOWN_ERROR,
        );
      }
    }
  }
}
