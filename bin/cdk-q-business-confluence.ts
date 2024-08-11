#!/opt/homebrew/opt/node/bin/node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkQBusinessConfluenceStack } from '../lib/cdk-q-business-confluence-stack';

const app = new cdk.App();
new CdkQBusinessConfluenceStack(
  app,
  'CdkQBusinessConfluenceStack',
  {
    identityCenterInstanceArn:
      'arn:aws:sso:::instance/ssoins-72235e79fffd8b92',
    confluenceHostUrl: 'https://jumic2.atlassian.net/',
  },
);
