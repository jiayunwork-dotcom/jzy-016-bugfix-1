import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`布雷顿循环试算服务已启动: http://0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  // 启动期致命错误（如数据库始终不可达）明确退出，交由容器重启策略处理
  // eslint-disable-next-line no-console
  console.error('启动失败:', err);
  process.exit(1);
});
