const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const Dotenv = require("dotenv-webpack");

// Add a simple webpack plugin to notify when builds are complete
class BuildNotifierPlugin {
  apply(compiler) {
    compiler.hooks.done.tap("BuildNotifierPlugin", (stats) => {
      const time = new Date().toLocaleTimeString();
      console.log(
        `\n✅ [${time}] Build completed ${
          stats.hasErrors() ? "with errors" : "successfully"
        }!`
      );
      console.log("Chrome extension ready - refresh in chrome://extensions/");

      if (stats.hasErrors()) {
        console.error("❌ Build errors found:");
        const info = stats.toJson();
        if (stats.hasErrors()) {
          info.errors.forEach((error) => {
            console.error(error.message);
          });
        }
      }
    });
  }
}

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  devtool: process.env.NODE_ENV === "production" ? false : "inline-source-map",
  entry: {
    background: "./src/background.js",
    "content-script": "./src/content-script.js",
    popup: "./src/popup.js",
    options: "./src/options.js",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },
  optimization: {
    // Don't bundle dependencies for content scripts
    // This ensures Chrome's Content Security Policy doesn't block execution
    splitChunks: {
      cacheGroups: {
        defaultVendors: false,
        default: false,
      },
    },
  },
  plugins: [
    new Dotenv({
      systemvars: true, // Load all system environment variables as well
    }),
    new CopyPlugin({
      patterns: [
        {
          from: "manifest.json",
          to: "[name][ext]",
        },
        {
          from: "images",
          to: "images",
        },
        // Copy source CSS for content scripts to keep it separate
        {
          from: "src/styles.css",
          to: "styles.css",
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: "./src/popup.html",
      filename: "popup.html",
      chunks: ["popup"],
    }),
    new HtmlWebpackPlugin({
      template: "./src/options.html",
      filename: "options.html",
      chunks: ["options"],
    }),
    new MiniCssExtractPlugin({
      filename: "[name].css",
    }),
    // Add build notifier plugin
    new BuildNotifierPlugin(),
  ],
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 300,
    poll: 1000,
  },
};
