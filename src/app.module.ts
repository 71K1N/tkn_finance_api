import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoryModule } from './category/category.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubcategoryModule } from './subcategory/subcategory.module';
import { BankAccountModule } from './bank-account/bank-account.module';

@Module({
  imports: [
    CategoryModule,
    TypeOrmModule.forRoot({
      database: './src/database/tknfinance.sqlite',
      type: 'sqlite',
      entities: ['dist/**/*.entity.js'],
      synchronize: true,
    }),
    SubcategoryModule,
    BankAccountModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
