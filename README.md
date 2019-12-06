# RegulatorForCodeDeploy SAM Deploy
sam package --template-file template.yml --output-template-file package.yml --s3-bucket <your_bucket>
sam deploy --template-file package.yml --stack-name <stack_name> --capabilities CAPABILITY_IAM --parameter-overrides RegulatorsEndpoint=<regulators_endpoint>
