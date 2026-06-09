/// <reference path="./.sst/platform/config.d.ts" />

/**
 * Infra is intentionally scoped to the uploads bucket for now. Dev keeps
 * running through doppler + docker-compose; RDS and web deployment are
 * deferred. After `sst deploy`, put the bucket name into Doppler as
 * UPLOADS_BUCKET_NAME (it's printed as an output).
 */
export default $config({
  app(input) {
    return {
      name: "basics-web",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const uploads = new sst.aws.Bucket("Uploads", {
      cors: {
        allowMethods: ["PUT", "GET"],
        allowOrigins: ["http://localhost:3000"],
        allowHeaders: ["*"],
      },
    });

    return {
      uploadsBucketName: uploads.name,
    };
  },
});
